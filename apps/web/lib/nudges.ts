import 'server-only';
// Automated nudges for inactive learners (E12.2), run by the scheduler every few minutes alongside
// class reminders. For each running cohort with nudges on, it works out each active learner's quiet
// spell and sends whichever step is due: a friendly nudge to the learner (email, and WhatsApp or SMS, in
// their language), then, if they are still inactive, one alert per cohort to the hub's owners and admins.
// Every step is claimed in the nudges table before sending, so overlapping runs never send twice.
import { system } from '@talentral/db';
import { daysInactive, inQuietHours, nudgeDue, nudgeSms, type NudgeRule } from '@talentral/domain';
import { env } from './env';
import { nudgeMail, sendMailBatch, teamNudgeMail } from './mail';
import { optedInNumbers, sendTexts, textingEnabled } from './texts';

type Cohort = { id: string; tenant_id: string; name: string; after_days: number; escalate_days: number; hub: string; slug: string; reply_to: string | null };
type Row = {
  enrolment_id: string; since: Date; full_name: string; email: string; phone: string | null; language: 'en' | 'ha';
  learner_at: Date | null; team: boolean;
};

export interface NudgeRun { cohorts: number; learners: number; teams: number; emails: number; texts: number; whatsapp: number }

export async function runNudges(now = new Date()): Promise<NudgeRun> {
  const run: NudgeRun = { cohorts: 0, learners: 0, teams: 0, emails: 0, texts: 0, whatsapp: 0 };
  if (inQuietHours(now)) return run;
  const sql = system();
  const cohorts = await sql<Cohort[]>`
    select c.id, c.tenant_id, c.name, c.nudge_after_days as after_days, c.nudge_escalate_days as escalate_days, t.name as hub, t.slug, t.contact_email as reply_to
    from public.cohorts c join public.tenants t on t.id = c.tenant_id
    where t.status = 'active' and c.status = 'running' and c.nudge_after_days is not null
      and (c.starts_on is null or c.starts_on <= (${now}::timestamptz at time zone 'Africa/Lagos')::date)
      and (c.ends_on is null or c.ends_on >= (${now}::timestamptz at time zone 'Africa/Lagos')::date)`;

  for (const c of cohorts) {
    run.cohorts += 1;
    const rule: NudgeRule = { afterDays: c.after_days, escalateDays: c.escalate_days };
    const rows = await sql<Row[]>`
      select act.enrolment_id, act.since, a.full_name, a.email::text, nullif(a.phone, '') as phone, coalesce(u.language, 'en') as language,
        (select n.created_at from public.nudges n where n.enrolment_id = act.enrolment_id and n.step = 'learner' and n.inactive_since = act.since) as learner_at,
        exists (select 1 from public.nudges n where n.enrolment_id = act.enrolment_id and n.step = 'team' and n.inactive_since = act.since) as team
      from app.cohort_activity_all(${c.id}) act
      join public.enrolments e on e.id = act.enrolment_id and e.status = 'active'
      join public.applications a on a.id = e.application_id
      left join public.users u on u.email = a.email`;

    const learnerDue: Row[] = [];
    const teamDue: Row[] = [];
    for (const r of rows) {
      const step = nudgeDue(rule, { since: new Date(r.since), learnerNudgedAt: r.learner_at ? new Date(r.learner_at) : null, teamAlerted: r.team }, now);
      if (step === 'learner') learnerDue.push(r);
      if (step === 'team') teamDue.push(r);
    }

    // Learner nudges: claim, send, record the channels used.
    for (const r of learnerDue) {
      const [claim] = await sql<{ id: string }[]>`
        insert into public.nudges (tenant_id, cohort_id, enrolment_id, step, inactive_since, created_at) values (${c.tenant_id}, ${c.id}, ${r.enrolment_id}, 'learner', ${r.since}, ${now})
        on conflict (enrolment_id, step, inactive_since) do nothing returning id`;
      if (!claim) continue;
      const days = daysInactive(new Date(r.since), now);
      const emailed = await sendMailBatch([nudgeMail(r.email, r.full_name, c.hub, c.name, days, r.language, `${env.appUrl}/learn`, c.reply_to)])
        .catch((e) => { console.error('nudge email failed', e); return 0; });
      const texted = textingEnabled() && r.phone
        ? await sendTexts([{ phone: r.phone, language: r.language, hub: c.hub, text: nudgeSms(r.language, c.hub, r.full_name.split(' ')[0] ?? r.full_name, days) }], await optedInNumbers([r.phone]))
        : { sms: 0, whatsapp: 0 };
      await sql`update public.nudges set emailed = ${emailed > 0}, texted = ${texted.sms + texted.whatsapp > 0} where id = ${claim.id}`;
      run.learners += 1; run.emails += emailed; run.texts += texted.sms; run.whatsapp += texted.whatsapp;
    }

    // Team alerts: claim each learner's step, then send one digest for the cohort.
    const claimed: Row[] = [];
    const ids: string[] = [];
    for (const r of teamDue) {
      const [claim] = await sql<{ id: string }[]>`
        insert into public.nudges (tenant_id, cohort_id, enrolment_id, step, inactive_since, created_at) values (${c.tenant_id}, ${c.id}, ${r.enrolment_id}, 'team', ${r.since}, ${now})
        on conflict (enrolment_id, step, inactive_since) do nothing returning id`;
      if (claim) { claimed.push(r); ids.push(claim.id); }
    }
    if (claimed.length) {
      const team = await sql<{ email: string }[]>`
        select u.email::text from public.memberships m join public.users u on u.id = m.user_id
        where m.tenant_id = ${c.tenant_id} and m.role in ('owner', 'admin') order by u.email`;
      const list = claimed.map((r) => ({ name: r.full_name, days: daysInactive(new Date(r.since), now), phone: r.phone })).sort((a, b) => b.days - a.days);
      const sent = await sendMailBatch(team.map((t) => teamNudgeMail(t.email, c.hub, c.name, list, `${env.appUrl}/dashboard/${c.slug}/cohorts/${c.id}`)))
        .catch((e) => { console.error('team nudge email failed', e); return 0; });
      await sql`update public.nudges set emailed = ${sent > 0} where id = any(${ids}::uuid[])`;
      run.teams += claimed.length; run.emails += sent;
    }
  }
  return run;
}
