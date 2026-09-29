// Sends class reminders: the day before (outside quiet hours) and about 30 minutes before.
// Called every few minutes by the database scheduler and daily by Vercel Cron, with the shared
// CRON_SECRET. Each session is claimed before sending, so overlapping calls never send twice.
import { system } from '@talentral/db';
import { reminderDue, watTime, type ReminderKind } from '@talentral/domain';
import { env } from '@/lib/env';
import { classReminderMail, sendMailBatch } from '@/lib/mail';
import { sendSmsBatch, smsEnabled } from '@/lib/sms';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Due = { id: string; title: string; starts_at: Date; mode: string; location: string | null; meeting_url: string | null; hub_name: string; reply_to: string | null };
type Learner = { email: string; phone: string; full_name: string; language: 'en' | 'ha' };

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorised', { status: 401 });
  const sql = system();
  const now = new Date();
  const sent = { day: 0, soon: 0, emails: 0, texts: 0 };

  for (const kind of ['soon', 'day'] as ReminderKind[]) {
    const column = kind === 'day' ? 'reminded_day_at' : 'reminded_soon_at';
    const candidates = await sql<Due[]>`
      select s.id, s.title, s.starts_at, s.mode, s.location, s.meeting_url, t.name as hub_name, t.contact_email as reply_to
      from public.class_sessions s join public.tenants t on t.id = s.tenant_id
      where t.status = 'active' and ${sql(column)} is null and s.starts_at > now() and s.starts_at <= now() + interval '26 hours'`;
    for (const s of candidates.filter((c) => reminderDue(kind, new Date(c.starts_at), now))) {
      // Claim it first; if another run got there, skip.
      const claimed = await sql`update public.class_sessions set ${sql(column)} = now() where id = ${s.id} and ${sql(column)} is null returning id`;
      if (!claimed.length) continue;
      const learners = await sql<Learner[]>`
        select a.email::text, a.phone, a.full_name, coalesce(u.language, 'en') as language
        from public.enrolments e join public.applications a on a.id = e.application_id left join public.users u on u.email = a.email
        where e.cohort_id = (select cohort_id from public.class_sessions where id = ${s.id}) and e.status <> 'dropped'`;
      const online = s.mode !== 'in_person' && Boolean(s.meeting_url);
      const info = { title: s.title, when: watTime(new Date(s.starts_at)), where: s.mode === 'online' ? 'Online' : s.location ?? 'At the hub', online };
      sent.emails += await sendMailBatch(learners.map((l) => classReminderMail(l.email, l.full_name, s.hub_name, kind, info, `${env.appUrl}/learn`, s.reply_to)))
        .catch((e) => { console.error('reminder emails failed', e); return 0; });
      if (smsEnabled()) {
        // Each learner gets the text in the language they read Talentral in.
        const clock = info.when.split(' ').slice(-1)[0];
        const text = (language: 'en' | 'ha') => (language === 'ha'
          ? kind === 'soon' ? `${s.hub_name}: za a fara "${s.title}" da ƙarfe ${clock}. ${online ? 'Shiga ta talentral.ng/learn' : 'Sai mun gan ka.'}`
            : `${s.hub_name}: tunatarwa, "${s.title}" zai kasance ${info.when}.`
          : kind === 'soon' ? `${s.hub_name}: "${s.title}" starts at ${clock}. ${online ? 'Join from talentral.ng/learn' : 'See you there.'}`
            : `${s.hub_name}: reminder, "${s.title}" is on ${info.when}.`);
        sent.texts += await sendSmsBatch(learners.map((l) => ({ to: l.phone, text: text(l.language).slice(0, 300) }))).catch(() => 0);
      }
      sent[kind] += 1;
    }
  }
  return Response.json({ ok: true, at: now.toISOString(), ...sent });
}
