import 'server-only';
import type { Tx } from '@talentral/db';
import type { LessonKind } from '@talentral/domain';

export interface LearnerCourse {
  cohort_id: string; cohort_name: string; hub_name: string; hub_slug: string; programme_title: string; course_id: string | null; course_title: string | null;
  starts_on: string | null; ends_on: string | null; enrolment_status: string; lessons: number; completed: number; last_lesson: string | null;
}
export interface OutlineRow {
  module_id: string; module_title: string; module_title_ha: string | null; module_position: number; opens_on: string | null;
  lesson_id: string; kind: LessonKind; title: string; title_ha: string | null; minutes: number | null; lesson_position: number;
  open: boolean; completed: boolean; passed: boolean; submission_status: 'submitted' | 'graded' | 'resubmit' | null;
}

export async function learnerLanguage(tx: Tx, userId: string): Promise<'en' | 'ha'> {
  const [u] = await tx<{ language: 'en' | 'ha' }[]>`select language from public.users where id = ${userId}`;
  return u?.language ?? 'en';
}

export async function learnerCourses(tx: Tx): Promise<LearnerCourse[]> {
  return (await tx<(Omit<LearnerCourse, 'lessons' | 'completed'> & { lessons: string; completed: string })[]>`
    select cohort_id, cohort_name, hub_name, hub_slug, programme_title, course_id, course_title, starts_on::text, ends_on::text, enrolment_status, lessons, completed, last_lesson
    from app.learner_courses()`).map((c) => ({ ...c, lessons: Number(c.lessons), completed: Number(c.completed) }));
}

export async function outline(tx: Tx, cohortId: string): Promise<OutlineRow[]> {
  return tx<OutlineRow[]>`select *, opens_on::text as opens_on from app.learner_outline(${cohortId})`;
}

// The next thing to do in a course: the first open lesson not yet done.
export function nextLesson(rows: OutlineRow[]): OutlineRow | null {
  return rows.find((r) => r.open && !r.completed && !(r.kind === 'assignment' && r.submission_status && r.submission_status !== 'resubmit')) ?? null;
}

// Work waiting on the learner: quizzes not yet passed and assignments not handed in (or sent back).
export function dueTasks(rows: OutlineRow[]): OutlineRow[] {
  return rows.filter((r) => r.open && ((r.kind === 'quiz' && !r.passed) || (r.kind === 'assignment' && (!r.submission_status || r.submission_status === 'resubmit'))));
}
