'use server';
// Course authoring: courses, modules, lessons and quiz questions. Owners and admins only; RLS
// enforces the same. Cohorts that follow a course get one gradebook entry per quiz and assignment.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { withUser, type Tx } from '@talentral/db';
import { LESSON_FILES, LESSON_KINDS, trueFalseOptions, validateQuestion, videoEmbedUrl, type LessonKind, type QuizQuestionInput } from '@talentral/domain';
import { requireHubRole } from '@/lib/auth';
import { syncCourseAssessments } from '@/lib/course-data';
import { accept, prepare, type PrepareResult } from '@/lib/uploads';

export interface CourseState { ok?: boolean; message?: string; errors?: Record<string, string> }
const UUID = /^[0-9a-f-]{36}$/;
const base = (slug: string, courseId: string) => `/dashboard/${slug}/courses/${courseId}`;

// ---------------------------------------------------------------- courses

export async function createCourse(slug: string, _prev: CourseState, form: FormData): Promise<CourseState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const title = String(form.get('title') ?? '').trim();
  const programme = String(form.get('programme_id') ?? '');
  if (title.length < 2 || title.length > 160) return { errors: { title: 'Give the course a title.' } };
  const id = await withUser(user.id, async (tx) => {
    const [c] = await tx<{ id: string }[]>`insert into public.courses (tenant_id, title, programme_id)
      values (${hub.id}, ${title}, ${UUID.test(programme) ? programme : null}) returning id`;
    await tx`insert into public.course_modules (tenant_id, course_id, title, position) values (${hub.id}, ${c!.id}, 'Week 1', 0)`;
    await tx`select app.audit(${hub.id}, 'course.created', 'course', ${c!.id})`;
    return c!.id;
  });
  redirect(`${base(slug, id)}?created=1`);
}

export async function saveCourse(slug: string, courseId: string, _prev: CourseState, form: FormData): Promise<CourseState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const title = String(form.get('title') ?? '').trim();
  const summary = String(form.get('summary') ?? '').trim();
  const programme = String(form.get('programme_id') ?? '');
  if (title.length < 2 || title.length > 160) return { errors: { title: 'Give the course a title.' } };
  if (summary.length > 600) return { errors: { summary: 'Keep the summary under 600 characters.' } };
  await withUser(user.id, (tx) => tx`update public.courses set title = ${title}, summary = ${summary || null}, programme_id = ${UUID.test(programme) ? programme : null}
    where id = ${courseId} and tenant_id = ${hub.id}`);
  revalidatePath(base(slug, courseId));
  return { ok: true, message: 'Course saved.' };
}

export async function setCourseStatus(slug: string, courseId: string, status: 'draft' | 'published'): Promise<CourseState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const result = await withUser(user.id, async (tx) => {
    if (status === 'published') {
      const [n] = await tx<{ lessons: number; empty_quizzes: number }[]>`
        select (select count(*)::int from public.lessons where course_id = ${courseId}) as lessons,
               (select count(*)::int from public.lessons l where l.course_id = ${courseId} and l.kind = 'quiz'
                  and not exists (select 1 from public.quiz_questions q where q.lesson_id = l.id)) as empty_quizzes`;
      if (!n?.lessons) return { message: 'Add at least one lesson before publishing.' };
      if (n.empty_quizzes) return { message: `${n.empty_quizzes} ${n.empty_quizzes === 1 ? 'quiz has' : 'quizzes have'} no questions yet.` };
    }
    await tx`update public.courses set status = ${status} where id = ${courseId} and tenant_id = ${hub.id}`;
    await tx`select app.audit(${hub.id}, ${`course.${status}`}, 'course', ${courseId})`;
    return { ok: true, message: status === 'published' ? 'Published. Learners in cohorts following this course can now see it.' : 'Moved back to draft. Learners no longer see it.' };
  });
  revalidatePath(base(slug, courseId));
  return result;
}

// ---------------------------------------------------------------- modules

export async function addModule(slug: string, courseId: string, _prev: CourseState, form: FormData): Promise<CourseState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const title = String(form.get('title') ?? '').trim();
  if (title.length < 2) return { errors: { title: 'Name the module, for example "Week 2: Styling with CSS".' } };
  await withUser(user.id, (tx) => tx`insert into public.course_modules (tenant_id, course_id, title, position)
    select ${hub.id}, ${courseId}, ${title}, coalesce(max(position) + 1, 0) from public.course_modules where course_id = ${courseId}`);
  revalidatePath(base(slug, courseId));
  return { ok: true, message: `“${title}” added.` };
}

const moduleSchema = z.object({
  title: z.string().trim().min(2, 'Name the module.').max(160),
  title_ha: z.string().trim().max(160),
  unlock_after_days: z.string().regex(/^\d{0,3}$/, 'Enter a number of days.'),
});

export async function saveModule(slug: string, courseId: string, moduleId: string, _prev: CourseState, form: FormData): Promise<CourseState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const parsed = moduleSchema.safeParse({ title: String(form.get('title') ?? ''), title_ha: String(form.get('title_ha') ?? ''), unlock_after_days: String(form.get('unlock_after_days') ?? '') });
  if (!parsed.success) return { errors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  const d = parsed.data;
  await withUser(user.id, (tx) => tx`update public.course_modules set title = ${d.title}, title_ha = ${d.title_ha || null},
    unlock_after_days = ${d.unlock_after_days === '' ? null : Number(d.unlock_after_days)} where id = ${moduleId} and tenant_id = ${hub.id}`);
  revalidatePath(base(slug, courseId));
  return { ok: true, message: 'Saved.' };
}

async function reorder(tx: Tx, table: 'course_modules' | 'lessons' | 'quiz_questions', parentColumn: string, parentId: string, id: string, direction: -1 | 1) {
  const rows = await tx<{ id: string }[]>`select id from ${tx(`public.${table}`)} where ${tx(parentColumn)} = ${parentId} order by position, id for update`;
  const i = rows.findIndex((r) => r.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j]!, rows[i]!];
  for (const [position, r] of rows.entries()) await tx`update ${tx(`public.${table}`)} set position = ${position} where id = ${r.id}`;
}

export async function moveModule(slug: string, courseId: string, moduleId: string, direction: -1 | 1): Promise<void> {
  const { user } = await requireHubRole(slug, ['owner', 'admin']);
  await withUser(user.id, (tx) => reorder(tx, 'course_modules', 'course_id', courseId, moduleId, direction));
  revalidatePath(base(slug, courseId));
}

// The whole outline at once, after a drag: module order, and each module's lessons in order
// (lessons can move between modules). Ignores anything that is not part of this course.
export async function reorderCourse(slug: string, courseId: string, outline: { moduleId: string; lessonIds: string[] }[]): Promise<CourseState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  if (!Array.isArray(outline) || outline.length > 200) return { message: 'Could not save the new order.' };
  const result = await withUser(user.id, async (tx) => {
    const modules = await tx<{ id: string }[]>`select id from public.course_modules where course_id = ${courseId} and tenant_id = ${hub.id} for update`;
    const lessons = await tx<{ id: string }[]>`select id from public.lessons where course_id = ${courseId} and tenant_id = ${hub.id} for update`;
    const mods = new Set(modules.map((m) => m.id));
    const less = new Set(lessons.map((l) => l.id));
    const seen = new Set<string>();
    const clean = outline.filter((o) => mods.has(o.moduleId)).map((o) => ({ moduleId: o.moduleId, lessonIds: (o.lessonIds ?? []).filter((l) => less.has(l) && !seen.has(l) && seen.add(l)) }));
    // Every module and lesson must be accounted for, or the outline on screen was stale.
    if (clean.length !== mods.size || seen.size !== less.size) return { message: 'The course changed while you were editing. Reload and try again.' };
    for (const [mi, m] of clean.entries()) {
      await tx`update public.course_modules set position = ${mi} where id = ${m.moduleId}`;
      for (const [li, l] of m.lessonIds.entries()) await tx`update public.lessons set position = ${li}, module_id = ${m.moduleId} where id = ${l}`;
    }
    return { ok: true, message: 'Order saved.' };
  });
  revalidatePath(base(slug, courseId));
  return result;
}

export async function deleteModule(slug: string, courseId: string, moduleId: string): Promise<CourseState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const result = await withUser(user.id, async (tx) => {
    const [n] = await tx<{ n: number }[]>`select count(*)::int as n from public.lessons where module_id = ${moduleId}`;
    if (n?.n) return { message: 'Move or delete this module’s lessons first.' };
    await tx`delete from public.course_modules where id = ${moduleId} and tenant_id = ${hub.id}`;
    return { ok: true };
  });
  revalidatePath(base(slug, courseId));
  return result;
}

// ---------------------------------------------------------------- lessons

export async function addLesson(slug: string, courseId: string, moduleId: string, _prev: CourseState, form: FormData): Promise<CourseState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const kind = String(form.get('kind') ?? 'text') as LessonKind;
  const title = String(form.get('title') ?? '').trim();
  if (!(kind in LESSON_KINDS)) return { errors: { kind: 'Choose a lesson type.' } };
  if (title.length < 2) return { errors: { title: 'Give the lesson a title.' } };
  const id = await withUser(user.id, async (tx) => {
    const [l] = await tx<{ id: string }[]>`
      insert into public.lessons (tenant_id, course_id, module_id, kind, title, position, max_attempts)
      select ${hub.id}, ${courseId}, ${moduleId}, ${kind}, ${title}, coalesce(max(position) + 1, 0), ${kind === 'quiz' ? 3 : null}
      from public.lessons where module_id = ${moduleId} returning id`;
    await syncCourseAssessments(tx, hub.id, courseId);
    return l!.id;
  });
  redirect(`${base(slug, courseId)}/lessons/${id}`);
}

export async function moveLesson(slug: string, courseId: string, moduleId: string, lessonId: string, direction: -1 | 1): Promise<void> {
  const { user } = await requireHubRole(slug, ['owner', 'admin']);
  await withUser(user.id, (tx) => reorder(tx, 'lessons', 'module_id', moduleId, lessonId, direction));
  revalidatePath(base(slug, courseId));
}

export async function deleteLesson(slug: string, courseId: string, lessonId: string): Promise<void> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  // Gradebook entries and results stay (the link is cleared), so no learner loses a grade.
  await withUser(user.id, (tx) => tx`delete from public.lessons where id = ${lessonId} and tenant_id = ${hub.id}`);
  revalidatePath(base(slug, courseId));
  redirect(base(slug, courseId));
}

export async function prepareLessonUpload(slug: string, lessonId: string, name: string, type: string, size: number): Promise<PrepareResult> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const [l] = await withUser(user.id, (tx) => tx<{ kind: LessonKind }[]>`select kind from public.lessons where id = ${lessonId} and tenant_id = ${hub.id}`);
  const rules = l && LESSON_FILES[l.kind];
  if (!rules) return { ok: false, error: 'This lesson does not take a file.' };
  return prepare(`tenants/${hub.id}/lessons/`, rules, name, type, size);
}

const lessonSchema = z.object({
  title: z.string().trim().min(2, 'Give the lesson a title.').max(160),
  title_ha: z.string().trim().max(160),
  body: z.string().max(60000),
  body_ha: z.string().max(60000),
  media_url: z.string().trim().max(500),
  minutes: z.string().regex(/^\d{0,3}$/, 'Enter minutes as a number.'),
  pass_mark: z.string().regex(/^\d{0,3}$/),
  max_attempts: z.string().regex(/^\d{0,2}$/),
  module_id: z.string().regex(UUID),
});

export async function saveLesson(slug: string, courseId: string, lessonId: string, _prev: CourseState, form: FormData): Promise<CourseState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const parsed = lessonSchema.safeParse(Object.fromEntries(Object.keys(lessonSchema.shape).map((k) => [k, String(form.get(k) ?? '')])));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors, message: 'Please check the highlighted fields.' };
  }
  const d = parsed.data;
  const [lesson] = await withUser(user.id, (tx) => tx<{ kind: LessonKind }[]>`select kind from public.lessons where id = ${lessonId} and tenant_id = ${hub.id}`);
  if (!lesson) return { message: 'Lesson not found.' };
  const errors: Record<string, string> = {};
  if (d.media_url && !videoEmbedUrl(d.media_url)) errors.media_url = 'Paste a YouTube or Vimeo link, such as https://youtu.be/… or https://vimeo.com/…';
  const passMark = d.pass_mark === '' ? 50 : Number(d.pass_mark);
  if (passMark > 100) errors.pass_mark = 'Use a percentage from 0 to 100.';
  const attempts = d.max_attempts === '' ? null : Number(d.max_attempts);
  if (attempts !== null && (attempts < 1 || attempts > 20)) errors.max_attempts = 'Allow 1 to 20 attempts, or leave blank for no limit.';
  const types = form.getAll('submission_types').map(String).filter((t) => ['text', 'link', 'file'].includes(t));
  if (lesson.kind === 'assignment' && types.length === 0) errors.submission_types = 'Allow at least one way to hand in work.';
  const rules = LESSON_FILES[lesson.kind];
  const file = rules ? await accept(form, 'file', `tenants/${hub.id}/lessons/`, rules) : null;
  if (file && 'error' in file) errors.file = file.error;
  if (Object.keys(errors).length) return { errors, message: 'Please check the highlighted fields.' };
  const skills = form.getAll('skills').map(String).filter((s) => UUID.test(s)).slice(0, 12);

  await withUser(user.id, async (tx) => {
    await tx`update public.lessons set title = ${d.title}, title_ha = ${d.title_ha || null}, body = ${d.body.trim() || null}, body_ha = ${d.body_ha.trim() || null},
      media_url = ${d.media_url || null}, minutes = ${d.minutes ? Math.min(600, Math.max(1, Number(d.minutes))) : null}, pass_mark = ${passMark},
      max_attempts = ${attempts}, module_id = ${d.module_id}, submission_types = ${types.length ? types : ['text', 'link', 'file']}
      where id = ${lessonId} and tenant_id = ${hub.id}`;
    if (file && !('error' in file)) {
      await tx`update public.lessons set file_path = ${file.path}, file_name = ${file.name}, file_type = ${file.type}, file_size = ${file.size} where id = ${lessonId}`;
    }
    if (lesson.kind === 'quiz' || lesson.kind === 'assignment') {
      await tx`delete from public.lesson_skills where lesson_id = ${lessonId} and not (skill_id = any(${skills}::uuid[]))`;
      for (const s of skills) await tx`insert into public.lesson_skills (lesson_id, skill_id, tenant_id) values (${lessonId}, ${s}, ${hub.id}) on conflict do nothing`;
    }
    await syncCourseAssessments(tx, hub.id, courseId);
  });
  revalidatePath(`${base(slug, courseId)}/lessons/${lessonId}`);
  revalidatePath(base(slug, courseId));
  return { ok: true, message: 'Lesson saved.' };
}

// ---------------------------------------------------------------- quiz questions

export async function saveQuestion(slug: string, courseId: string, lessonId: string, questionId: string | null, q: QuizQuestionInput): Promise<CourseState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const options = q.kind === 'true_false' ? trueFalseOptions() : q.options.filter((o) => o.text.trim()).map((o) => ({ id: o.id, text: o.text.trim().slice(0, 300), text_ha: o.text_ha?.trim().slice(0, 300) || null }));
  const clean: QuizQuestionInput = { ...q, prompt: q.prompt.trim().slice(0, 1000), prompt_ha: q.prompt_ha?.trim().slice(0, 1000) || null, options, correct: q.correct.filter((c) => options.some((o) => o.id === c)), explanation: q.explanation?.trim().slice(0, 1000) || null };
  const problem = validateQuestion(clean);
  if (problem) return { message: problem };
  await withUser(user.id, async (tx) => {
    if (questionId) {
      await tx`update public.quiz_questions set kind = ${clean.kind}, prompt = ${clean.prompt}, prompt_ha = ${clean.prompt_ha ?? null}, options = ${tx.json(clean.options as never)},
        correct = ${clean.correct}, points = ${clean.points}, explanation = ${clean.explanation ?? null} where id = ${questionId} and lesson_id = ${lessonId} and tenant_id = ${hub.id}`;
    } else {
      await tx`insert into public.quiz_questions (tenant_id, lesson_id, kind, prompt, prompt_ha, options, correct, points, explanation, position)
        select ${hub.id}, ${lessonId}, ${clean.kind}, ${clean.prompt}, ${clean.prompt_ha ?? null}, ${tx.json(clean.options as never)}, ${clean.correct}, ${clean.points}, ${clean.explanation ?? null},
          coalesce(max(position) + 1, 0) from public.quiz_questions where lesson_id = ${lessonId}`;
    }
  });
  revalidatePath(`${base(slug, courseId)}/lessons/${lessonId}`);
  return { ok: true, message: questionId ? 'Question saved.' : 'Question added.' };
}

export async function deleteQuestion(slug: string, courseId: string, lessonId: string, questionId: string): Promise<void> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  await withUser(user.id, (tx) => tx`delete from public.quiz_questions where id = ${questionId} and tenant_id = ${hub.id}`);
  revalidatePath(`${base(slug, courseId)}/lessons/${lessonId}`);
}

export async function moveQuestion(slug: string, courseId: string, lessonId: string, questionId: string, direction: -1 | 1): Promise<void> {
  const { user } = await requireHubRole(slug, ['owner', 'admin']);
  await withUser(user.id, (tx) => reorder(tx, 'quiz_questions', 'lesson_id', lessonId, questionId, direction));
  revalidatePath(`${base(slug, courseId)}/lessons/${lessonId}`);
}

// ---------------------------------------------------------------- cohorts

export async function setCohortCourse(slug: string, cohortId: string, courseId: string | null): Promise<CourseState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const saved = await withUser(user.id, async (tx) => {
    // Choosing a course replaces any learning path the cohort followed.
    const rows = await tx`update public.cohorts set course_id = ${courseId && UUID.test(courseId) ? courseId : null},
      path_id = case when ${courseId && UUID.test(courseId) ? courseId : null}::uuid is null then path_id else null end
      where id = ${cohortId} and tenant_id = ${hub.id} returning id`;
    if (!rows.length) return false;
    if (courseId && UUID.test(courseId)) await syncCourseAssessments(tx, hub.id, courseId);
    await tx`select app.audit(${hub.id}, 'cohort.course_set', 'cohort', ${cohortId}, ${tx.json({ course: courseId })})`;
    return true;
  });
  if (!saved) return { message: 'We could not change this cohort. Please try again.' };
  revalidatePath(`/dashboard/${slug}/cohorts/${cohortId}`);
  return { ok: true, message: courseId ? 'This cohort now follows the course. Its quizzes and assignments are in the gradebook.' : 'Course removed from this cohort.' };
}
