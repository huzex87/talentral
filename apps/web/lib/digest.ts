// Monday summaries for hub teams (see weeklyDigestMail). From 07:00 West Africa Time on Monday,
// every team member who has not turned it off gets one email per hub for the week. Each send is
// claimed first (memberships.digest_sent_on), so overlapping scheduler runs never send twice, and
// a run missed on Monday still sends later that week. The demo academy never gets one.
import { system } from '@talentral/db';
import { env } from './env';
import { DEMO_SLUG } from './demo-ids';
import { sendMailBatch, weeklyDigestMail, type Mail } from './mail';

const WAT_OFFSET_MS = 60 * 60 * 1000;

// The Monday (as a yyyy-mm-dd date in West Africa Time) of the week containing `now`, and whether
// it is already past 07:00 that Monday.
export function digestWeek(now: Date): { monday: string; due: boolean } {
  const wat = new Date(now.getTime() + WAT_OFFSET_MS);
  const day = (wat.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(Date.UTC(wat.getUTCFullYear(), wat.getUTCMonth(), wat.getUTCDate() - day));
  const due = day > 0 || wat.getUTCHours() >= 7;
  return { monday: monday.toISOString().slice(0, 10), due };
}

type Member = { tenant_id: string; user_id: string; role: string; email: string; full_name: string | null; hub: string; slug: string };

export async function runDigests(now = new Date()): Promise<{ sent: number }> {
  const { monday, due } = digestWeek(now);
  if (!due) return { sent: 0 };
  const sql = system();
  // Claim this week's sends in one statement; only rows claimed here are sent by this run.
  const members = await sql<Member[]>`
    with claimed as (
      update public.memberships m set digest_sent_on = ${monday}::date
      from public.tenants t
      where t.id = m.tenant_id and t.status = 'active' and t.slug <> ${DEMO_SLUG} and m.weekly_digest and (m.digest_sent_on is null or m.digest_sent_on < ${monday}::date)
      returning m.tenant_id, m.user_id, m.role
    )
    select c.tenant_id, c.user_id, c.role, u.email::text, u.full_name, t.name as hub, t.slug
    from claimed c join public.users u on u.id = c.user_id join public.tenants t on t.id = c.tenant_id`;
  const mails: Mail[] = [];
  for (const m of members) {
    const [f] = await sql<{ applications: number; scored: number; to_score: number; to_grade: number; attendance: string | null; classes: number; quiet: number; certified: number; placed: number }[]>`
      select
        (select count(*)::int from public.applications where tenant_id = ${m.tenant_id} and submitted_at > now() - interval '7 days') as applications,
        (select count(*)::int from public.application_scores where tenant_id = ${m.tenant_id} and reviewer_id = ${m.user_id} and updated_at > now() - interval '7 days') as scored,
        (select count(*)::int from public.applications a where a.tenant_id = ${m.tenant_id} and a.status in ('submitted', 'under_review')
           and not exists (select 1 from public.application_scores s where s.application_id = a.id and s.reviewer_id = ${m.user_id})) as to_score,
        (select count(*)::int from public.submissions where tenant_id = ${m.tenant_id} and status = 'submitted') as to_grade,
        (select round(100.0 * count(*) filter (where at.status in ('present', 'late')) / nullif(count(*) filter (where at.status <> 'excused'), 0))::text
           from public.attendance at join public.class_sessions s on s.id = at.session_id
           where s.tenant_id = ${m.tenant_id} and s.starts_at > now() - interval '7 days' and s.starts_at <= now()) as attendance,
        (select count(*)::int from public.class_sessions where tenant_id = ${m.tenant_id} and starts_at > now() - interval '7 days' and starts_at <= now()) as classes,
        (select count(distinct enrolment_id)::int from public.nudges where tenant_id = ${m.tenant_id} and step = 'team' and created_at > now() - interval '7 days') as quiet,
        (select count(*)::int from public.certificates where tenant_id = ${m.tenant_id} and issued_at > now() - interval '7 days') as certified,
        (select count(distinct rc.id)::int from public.role_candidates rc join public.users u on u.id = rc.user_id
           join public.applications a on a.email = u.email and a.tenant_id = ${m.tenant_id} join public.enrolments e on e.application_id = a.id
           where rc.stage = 'placed' and rc.updated_at > now() - interval '7 days') as placed`;
    const url = `${env.appUrl}/dashboard/${m.slug}`;
    // Facilitators teach only: their summary leaves out applications.
    const selection = m.role !== 'facilitator';
    mails.push(weeklyDigestMail(m.email, m.full_name, m.hub, {
      selection, applications: selection ? f!.applications : 0, scoredByYou: selection ? f!.scored : 0, toScore: selection ? f!.to_score : 0, toGrade: f!.to_grade,
      attendance: f!.attendance === null ? null : Number(f!.attendance), classes: f!.classes, quiet: f!.quiet, certified: f!.certified, placed: f!.placed,
    }, url, url));
  }
  return { sent: mails.length ? await sendMailBatch(mails) : 0 };
}
