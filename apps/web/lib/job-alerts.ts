import 'server-only';
// Job alerts: learners who turned them on hear about new jobs on the board that fit their
// Passport, by email and by WhatsApp or SMS. Run by the scheduler between 07:00 and 21:00 West
// Africa Time; each person gets at most three alerts a day and each job only once. Every alert is
// claimed in job_alerts_sent before it is sent, so overlapping runs never send twice.
import { system } from '@talentral/db';
import {
  JOB_ALERTS_PER_DAY, JOB_ALERT_MIN_SCORE, JOB_ALERT_WINDOW_DAYS, JOB_TYPES, WORK_MODES, alertHours, matchTalent, payRange,
  type JobType, type WorkAvailability, type WorkMode,
} from '@talentral/domain';
import { env } from './env';
import { jobAlertMail, sendMailBatch, type JobAlertItem, type Mail } from './mail';
import { optedInNumbers, sendTexts, textingEnabled } from './texts';

type Job = { id: string; title: string; skills: string[]; work_mode: WorkMode; job_type: JobType; state: string | null; pay_min: number | null; pay_max: number | null; employer_name: string };
type Person = { user_id: string; email: string; full_name: string | null; language: 'en' | 'ha'; phone: string | null; skills: string[];
  state: string | null; work_modes: string[]; availability: WorkAvailability; relocate: boolean; sent_today: number };

export async function runJobAlerts(now = new Date()): Promise<{ people: number; alerts: number }> {
  if (!alertHours(now)) return { people: 0, alerts: 0 };
  const sql = system();
  const since = new Date(now.getTime() - JOB_ALERT_WINDOW_DAYS * 86_400_000);
  const jobs = await sql<Job[]>`
    select id, title, skills, work_mode, job_type, state, pay_min, pay_max, employer_name from app.job_board() where published_at > ${since}`;
  if (!jobs.length) return { people: 0, alerts: 0 };
  const jobIds = jobs.map((j) => j.id);
  const people = await sql<Person[]>`
    select p.user_id, u.email::text, u.full_name, coalesce(u.language, 'en') as language, p.skills, p.state, p.work_modes, p.availability, p.relocate,
      coalesce(u.phone, (select a.phone from public.applications a where a.email = u.email order by a.submitted_at desc nulls last limit 1)) as phone,
      (select count(*)::int from public.job_alerts_sent s where s.user_id = p.user_id and s.sent_at > ${now}::timestamptz - interval '24 hours') as sent_today
    from public.passports p join public.users u on u.id = p.user_id
    where p.job_alerts and p.availability <> 'not_looking' and cardinality(p.skills) > 0`;
  if (!people.length) return { people: 0, alerts: 0 };
  // Skip jobs someone already heard about, applied to or was put forward for.
  const done = new Set((await sql<{ k: string }[]>`
    select user_id || ':' || role_id as k from public.job_alerts_sent where role_id = any(${jobIds}::uuid[])
    union select user_id || ':' || role_id from public.role_candidates where role_id = any(${jobIds}::uuid[])`).map((r) => r.k));

  const mails: Mail[] = [];
  const texts: { phone: string; language: 'en' | 'ha'; text: string }[] = [];
  let alerts = 0;
  let reached = 0;
  for (const p of people) {
    const budget = JOB_ALERTS_PER_DAY - p.sent_today;
    if (budget <= 0) continue;
    const picks = jobs.filter((j) => !done.has(`${p.user_id}:${j.id}`))
      .map((j) => ({ j, m: matchTalent({ skills: j.skills, work_mode: j.work_mode, state: j.state },
        { skills: p.skills, tracks: [], state: p.state, work_modes: p.work_modes, availability: p.availability, readiness: 'not_assessed', relocate: p.relocate }) }))
      .filter((x) => x.m.matched.length > 0 && x.m.score >= JOB_ALERT_MIN_SCORE)
      .sort((a, b) => b.m.score - a.m.score).slice(0, budget);
    const claimed: typeof picks = [];
    for (const x of picks) {
      const rows = await sql`insert into public.job_alerts_sent (user_id, role_id, sent_at, match_score) values (${p.user_id}, ${x.j.id}, ${now}, ${x.m.score})
        on conflict do nothing returning role_id`;
      if (rows.length) claimed.push(x);
    }
    if (!claimed.length) continue;
    reached += 1;
    alerts += claimed.length;
    const ha = p.language === 'ha';
    const items: JobAlertItem[] = claimed.map(({ j, m }) => ({
      title: j.title, employer: j.employer_name, matched: m.matched, url: `${env.appUrl}/jobs/${j.id}`,
      where: [WORK_MODES[j.work_mode], JOB_TYPES[j.job_type], j.state].filter(Boolean).join(' · '), pay: payRange(j.pay_min, j.pay_max),
    }));
    mails.push(jobAlertMail(p.email, p.full_name, p.language, items, `${env.appUrl}/passport`));
    if (p.phone) {
      const first = claimed[0]!.j;
      const more = claimed.length - 1;
      texts.push({ phone: p.phone, language: p.language, text: ha
        ? `Talentral: sabon aiki ya dace da kai: "${first.title}" a ${first.employer_name}${more ? ` da wasu ${more}` : ''}. Duba ka nema: ${env.appUrl}/jobs/${first.id}`
        : `Talentral: a new job matches your Passport: "${first.title}" at ${first.employer_name}${more ? ` and ${more} more` : ''}. See it and apply: ${env.appUrl}/jobs/${first.id}` });
    }
  }
  if (mails.length) await sendMailBatch(mails).catch((e) => console.error('job alert emails failed', e));
  if (texts.length && textingEnabled()) {
    const optedIn = await optedInNumbers(texts.map((t) => t.phone));
    await sendTexts(texts.map((t) => ({ ...t, hub: 'Talentral' })), optedIn).catch((e) => console.error('job alert texts failed', e));
  }
  return { people: reached, alerts };
}
