import 'server-only';
// One place that turns a cohort's register and gradebook into each learner's attendance, weighted
// score and standing, so the cohort page, certificates and reports always agree.
import type { Tx } from '@talentral/db';
import { attendanceRate, completionStanding, weightedScore, type AssessmentDef, type Mark, type Standing } from '@talentral/domain';

export interface CohortInfo { id: string; name: string; min_attendance: number; pass_mark: number; programme: string; programme_id: string }
export interface LearnerStats {
  id: string; application_id: string; full_name: string; email: string; reference: string; track: string | null;
  status: 'active' | 'completed' | 'dropped'; source: 'applied' | 'imported'; completed_at: Date | null;
  rate: number | null; score: { percent: number | null; graded: number; total: number }; standing: Standing;
  certificate: string | null; certificate_revoked: boolean;
}

export async function loadCohortLearners(tx: Tx, tenantId: string, cohort: Pick<CohortInfo, 'id' | 'min_attendance' | 'pass_mark'>) {
  const [counts] = await tx<{ held: number }[]>`select count(*)::int as held from public.class_sessions where cohort_id = ${cohort.id} and starts_at <= now()`;
  const held = counts?.held ?? 0;
  const assessments = await tx<AssessmentDef[]>`select id, max_score as max, weight from public.assessments where cohort_id = ${cohort.id} order by created_at`;
  const rows = await tx<(Omit<LearnerStats, 'rate' | 'score' | 'standing'> & { marks: Mark[] | null; results: Record<string, number> | null })[]>`
    select e.id, e.application_id, e.status, e.completed_at, a.full_name, a.email, a.reference, a.track, a.source,
      (select array_agg(at.status) from public.attendance at join public.class_sessions s on s.id = at.session_id
         where at.enrolment_id = e.id and s.starts_at <= now()) as marks,
      (select jsonb_object_agg(r.assessment_id, r.score) from public.assessment_results r where r.enrolment_id = e.id) as results,
      c.serial as certificate, (c.revoked_at is not null) as certificate_revoked
    from public.enrolments e join public.applications a on a.id = e.application_id
    left join public.certificates c on c.enrolment_id = e.id
    where e.cohort_id = ${cohort.id} and e.tenant_id = ${tenantId}
    order by (e.status = 'dropped'), a.full_name`;
  const learners: LearnerStats[] = rows.map(({ marks, results, ...r }) => {
    const rate = attendanceRate(marks ?? [], held);
    const score = weightedScore(assessments, Object.fromEntries(Object.entries(results ?? {}).map(([k, v]) => [k, Number(v)])));
    return { ...r, rate, score, standing: completionStanding(rate, cohort.min_attendance, score, cohort.pass_mark) };
  });
  return { held, assessments, learners };
}
