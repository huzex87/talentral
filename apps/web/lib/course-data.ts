import 'server-only';
import type { Tx } from '@talentral/db';

// Every cohort following the course, on its own or as part of a learning path, gets a gradebook
// entry for each quiz and assignment, tagged with the lesson's skills. Safe to run repeatedly.
export async function syncCourseAssessments(tx: Tx, tenantId: string, courseId: string) {
  await tx`
    insert into public.assessments (tenant_id, cohort_id, title, kind, max_score, weight, lesson_id)
    select ${tenantId}, co.id, l.title, l.kind, 100, 1, l.id
    from public.cohorts co join public.lessons l on l.course_id = ${courseId}
    where co.tenant_id = ${tenantId} and l.kind in ('quiz', 'assignment')
      and (co.course_id = ${courseId} or co.path_id in (select pc.path_id from public.learning_path_courses pc where pc.course_id = ${courseId}))
    on conflict (cohort_id, lesson_id) where lesson_id is not null do nothing`;
  await tx`update public.assessments a set title = l.title from public.lessons l where a.lesson_id = l.id and l.course_id = ${courseId} and a.title <> l.title`;
  await tx`
    insert into public.assessment_skills (assessment_id, skill_id, tenant_id)
    select a.id, ls.skill_id, ${tenantId} from public.assessments a join public.lesson_skills ls on ls.lesson_id = a.lesson_id
    join public.lessons l on l.id = a.lesson_id where l.course_id = ${courseId} and a.tenant_id = ${tenantId}
    on conflict do nothing`;
}

// The same for every course in a learning path.
export async function syncPathAssessments(tx: Tx, tenantId: string, pathId: string) {
  const courses = await tx<{ course_id: string }[]>`select course_id from public.learning_path_courses where path_id = ${pathId} and tenant_id = ${tenantId}`;
  for (const c of courses) await syncCourseAssessments(tx, tenantId, c.course_id);
}
