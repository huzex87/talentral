import 'server-only';
// The 90-day retention check (MVP-2 month 8), run by the scheduler alongside reminders and nudges.
// When a hire's check opens, the employer's team gets one email listing everyone due; a week later,
// one reminder for anyone still unanswered. Employers without a Talentral account are followed up by
// the talent team instead. Each step is claimed on the placement before sending, so overlapping runs
// never send twice. Outside quiet hours only, like nudges.
import { system } from '@talentral/db';
import { inQuietHours, retentionMessageDue, watToday } from '@talentral/domain';
import { adminEmails } from './employer';
import { env } from './env';
import { retentionCheckMail, sendMailBatch } from './mail';

type Row = {
  id: string; employer_id: string; employer: string; role_id: string; role: string; person: string; start_date: string;
  retained: boolean | null; asked: boolean; reminded: boolean; emails: string[];
};

export interface RetentionRun { asked: number; reminded: number; emails: number }

const day = (d: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));

export async function runRetentionChecks(now = new Date()): Promise<RetentionRun> {
  const run: RetentionRun = { asked: 0, reminded: 0, emails: 0 };
  if (inQuietHours(now)) return run;
  const sql = system();
  const today = watToday(now);
  const rows = await sql<Row[]>`
    select c.id, e.id as employer_id, e.name as employer, r.id as role_id, r.title as role, coalesce(u.full_name, 'Your new hire') as person,
      c.start_date::text as start_date, c.retained, c.retention_asked_at is not null as asked, c.retention_reminded_at is not null as reminded,
      coalesce((select array_agg(distinct mu.email::text) from public.employer_members m join public.users mu on mu.id = m.user_id where m.employer_id = e.id), '{}') as emails
    from public.role_candidates c join public.job_roles r on r.id = c.role_id join public.employers e on e.id = r.employer_id join public.users u on u.id = c.user_id
    where c.stage = 'placed' and c.retained is null and c.start_date <= ${today}::date - 90 and c.retention_reminded_at is null`;

  // One email per employer and kind, listing each person due.
  const groups = new Map<string, { kind: 'ask' | 'remind'; employer: string; emails: string[]; roleId: string; people: { name: string; role: string; start: string }[] }>();
  for (const r of rows) {
    const kind = retentionMessageDue({ start_date: r.start_date, retained: r.retained, asked: r.asked, reminded: r.reminded }, today);
    if (!kind) continue;
    const claimed = kind === 'ask'
      ? await sql`update public.role_candidates set retention_asked_at = now() where id = ${r.id} and retention_asked_at is null and retained is null returning id`
      : await sql`update public.role_candidates set retention_reminded_at = now() where id = ${r.id} and retention_reminded_at is null and retained is null returning id`;
    if (!claimed.length) continue;
    run[kind === 'ask' ? 'asked' : 'reminded'] += 1;
    const key = `${r.employer_id}:${kind}`;
    const g = groups.get(key) ?? { kind, employer: r.employer, emails: r.emails, roleId: r.role_id, people: [] };
    g.people.push({ name: r.person, role: r.role, start: day(r.start_date) });
    groups.set(key, g);
  }

  const mails = [...groups.values()].flatMap((g) => {
    // Employers without an account: the talent team follows up from the Placements page.
    const to = g.emails.length ? g.emails : adminEmails();
    const url = g.emails.length ? (g.people.length === 1 ? `${env.appUrl}/employer/jobs/${g.roleId}` : `${env.appUrl}/employer`) : `${env.appUrl}/platform/talent/placements?show=due`;
    return to.map((addr) => retentionCheckMail(addr, g.employer, g.people, g.kind, url));
  });
  if (mails.length) run.emails = await sendMailBatch(mails).catch((e) => { console.error('retention emails failed', e); return 0; });
  return run;
}
