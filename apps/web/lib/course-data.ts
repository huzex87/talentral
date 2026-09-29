import 'server-only';
import type { Tx } from '@talentral/db';

// Every cohort following the course gets a gradebook entry for each quiz and assignment, tagged
// with the lesson's skills. Safe to run repeatedly.
export async function syncCourseAssessments(tx: Tx, tenantId: string, courseId: string) {
  await tx`
    insert into public.assessments (tenant_id, cohort_id, title, kind, max_score, weight, lesson_id)
    select ${tenantId}, co.id, l.title, l.kind, 100, 1, l.id
    from public.cohorts co join public.lessons l on l.course_id = co.course_id
    where co.course_id = ${courseId} and co.tenant_id = ${tenantId} and l.kind in ('quiz', 'assignment')
    on conflict (cohort_id, lesson_id) where lesson_id is not null do nothing`;
  await tx`update public.assessments a set title = l.title from public.lessons l where a.lesson_id = l.id and l.course_id = ${courseId} and a.title <> l.title`;
  await tx`
    insert into public.assessment_skills (assessment_id, skill_id, tenant_id)
    select a.id, ls.skill_id, ${tenantId} from public.assessments a join public.lesson_skills ls on ls.lesson_id = a.lesson_id
    join public.lessons l on l.id = a.lesson_id where l.course_id = ${courseId} and a.tenant_id = ${tenantId}
    on conflict do nothing`;
}
