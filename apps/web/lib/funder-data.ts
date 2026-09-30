import 'server-only';
// Everything the funder report (E11.3) shows for one cohort, loaded as the signed-in person so
// Row-Level Security keeps it to their hub. Headline figures come from the same loaders as the Impact
// dashboard and the cohort page, so the three always agree. Aggregates only, apart from the partner
// names shown on the cover.
import type { Tx } from '@talentral/db';
import { NUDGE_DEFAULTS, engagement, nudgeReturns, progressBands, reachShares, type Engagement } from '@talentral/domain';
import { loadCohortLearners } from './cohort-data';
import { loadImpact } from './impact-data';

export type FunderCohort = {
  id: string; name: string; status: string; starts_on: string | null; ends_on: string | null; min_attendance: number; pass_mark: number;
  programme: string; programme_id: string; course_id: string | null; course: string | null; funder_summary: string | null; nudge_after_days: number | null;
};

export async function loadFunderReport(tx: Tx, tenantId: string, cohortId: string) {
  const [cohort] = await tx<FunderCohort[]>`
    select c.id, c.name, c.status, c.starts_on::text, c.ends_on::text, c.min_attendance, c.pass_mark, c.funder_summary, c.nudge_after_days,
      p.title as programme, p.id as programme_id, c.course_id, co.title as course
    from public.cohorts c join public.programmes p on p.id = c.programme_id left join public.courses co on co.id = c.course_id
    where c.id = ${cohortId} and c.tenant_id = ${tenantId}`;
  if (!cohort) return null;

  const { impact, learners: rows } = await loadImpact(tx, tenantId, { cohort: cohortId });
  const { held, learners } = await loadCohortLearners(tx, tenantId, cohort);
  const scores = learners.flatMap((l) => (l.status !== 'dropped' && l.score.percent !== null ? [l.score.percent] : []));
  const averageScore = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;

  const partners = await tx<{ id: string; name: string; role: string; logo_path: string }[]>`
    select pp.id, pp.name, pp.role, pp.logo_path from public.programme_partners pp where pp.programme_id = ${cohort.programme_id}
    order by case pp.role when 'funder' then 0 when 'sponsor' then 1 else 2 end, pp.position, pp.created_at`;

  // Course progress: share of the course's lessons each learner has completed.
  const progress = cohort.course_id ? await tx<{ done: number; total: number }[]>`
    select (select count(*)::int from public.lesson_progress lp join public.lessons l on l.id = lp.lesson_id
              where lp.enrolment_id = e.id and lp.completed_at is not null and l.course_id = ${cohort.course_id}) as done,
           (select count(*)::int from public.lessons l where l.course_id = ${cohort.course_id}) as total
    from public.enrolments e where e.cohort_id = ${cohortId} and e.status <> 'dropped'` : [];

  const assessments = await tx<{ title: string; kind: string; graded: number; average: string | null }[]>`
    select a.title, a.kind, (select count(*)::int from public.assessment_results r where r.assessment_id = a.id) as graded,
      (select round(100.0 * avg(r.score) / a.max_score, 1) from public.assessment_results r where r.assessment_id = a.id) as average
    from public.assessments a where a.cohort_id = ${cohortId} order by a.created_at`;

  // Skills proven by graded work at or above the pass mark (the same rule as the Passport).
  const skills = await tx<{ name: string; learners: number }[]>`
    select s.name, count(distinct r.enrolment_id)::int as learners
    from public.assessment_results r join public.assessments a on a.id = r.assessment_id
    join public.assessment_skills k on k.assessment_id = a.id join public.skills s on s.id = k.skill_id
    where a.cohort_id = ${cohortId} and r.score / a.max_score * 100 >= ${cohort.pass_mark}
    group by s.name order by learners desc, s.name limit 10`;

  const activity = await tx<{ enrolment_id: string; last_active_at: Date | null; since: Date }[]>`select * from app.cohort_activity(${cohortId})`;
  const lastNudges = await tx<{ enrolment_id: string; at: Date }[]>`
    select enrolment_id, max(created_at) as at from public.nudges where cohort_id = ${cohortId} and step = 'learner' group by enrolment_id`;

  const now = new Date();
  const active = new Set(learners.filter((l) => l.status === 'active').map((l) => l.id));
  const engagementCounts: Record<Engagement, number> = { active: 0, quiet: 0, inactive: 0, never: 0 };
  const lastActive = new Map<string, Date | null>();
  for (const a of activity) {
    const last = a.last_active_at ? new Date(a.last_active_at) : null;
    lastActive.set(a.enrolment_id, last);
    if (active.has(a.enrolment_id)) engagementCounts[engagement(last, new Date(a.since), now, cohort.nudge_after_days ?? NUDGE_DEFAULTS.afterDays)] += 1;
  }
  const activated = activity.filter((a) => a.last_active_at).length;
  const returns = nudgeReturns(lastNudges.map((n) => ({ lastNudge: new Date(n.at), lastActive: lastActive.get(n.enrolment_id) ?? null })));
  const reach = reachShares(rows.map((r) => r.detail.answers), cohort.starts_on ? new Date(cohort.starts_on) : now);

  return {
    cohort, impact, held, averageScore, partners, assessments, skills, reach, returns, activated, engagement: engagementCounts,
    progress: cohort.course_id ? progressBands(progress) : null,
  };
}

export type FunderReport = NonNullable<Awaited<ReturnType<typeof loadFunderReport>>>;

// The figures Claude may use when drafting the executive summary: aggregates only, never a name.
export function funderFacts(r: FunderReport, hub: string): string {
  const k = r.impact.kpis;
  const lines = [
    `Hub: ${hub}`, `Programme: ${r.cohort.programme}`, `Cohort: ${r.cohort.name} (${r.cohort.status})`,
    r.cohort.starts_on ? `Dates: ${r.cohort.starts_on} to ${r.cohort.ends_on ?? 'ongoing'}` : '',
    r.partners.length ? `Partners: ${r.partners.map((p) => `${p.name} (${p.role})`).join(', ')}` : '',
    `Applications: ${k.applicants}`, `Enrolled: ${k.enrolled}`, `Started learning on Talentral: ${r.activated}`,
    ...([['Women', r.reach.women], ['Aged 18 to 35', r.reach.youth], ['With a disability', r.reach.disability]] as const)
      .map(([label, x]) => `${label}: ${x.share === null ? 'not recorded' : `${x.share}% of the ${x.answered} who answered`}`),
    `Sessions held: ${r.held}`, `Average attendance: ${k.averageAttendance ?? 'no sessions yet'}%`, `Attendance needed to complete: ${r.cohort.min_attendance}%`,
    `Average assessment score: ${r.averageScore ?? 'not graded yet'}%`, `Pass mark: ${r.cohort.pass_mark}%`,
    `Completed: ${k.completed} (${k.completionRate ?? 0}% of enrolled)`, `Certificates issued: ${k.certified}`,
    r.skills.length ? `Skills proven by graded work: ${r.skills.map((s) => `${s.name} (${s.learners})`).join(', ')}` : '',
    r.progress ? `Course progress: ${r.progress.map((b) => `${b.band} ${b.n}`).join(', ')}` : '',
    `Put forward to employers: ${r.impact.funnel.find((f) => f.stage === 'Put forward')?.n ?? 0}`, `Placed in work: ${k.placed}`,
    r.returns.nudged ? `Inactive learners nudged: ${r.returns.nudged}, of whom ${r.returns.returned} came back` : '',
  ];
  return lines.filter(Boolean).join('\n');
}
