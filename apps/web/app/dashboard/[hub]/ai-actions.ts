'use server';
// AI drafting for hub teams. Each action checks the person's role, gathers the context Claude needs
// from the database (so a draft is grounded in the hub's own programme or course) and returns a draft
// for the person to review. Nothing is saved here: the person edits the draft and presses Save.
import { withUser } from '@talentral/db';
import type { RubricLevel } from '@talentral/domain';
import { hubAccess, requireHubRole } from '@/lib/auth';
import { draftFeedback, draftLesson, draftProgramme, draftQuestions, translateLesson, type DraftQuestion, type FeedbackDraft, type LessonDraft, type ProgrammeDraft, type Translation } from '@/lib/ai-drafts';
import type { DraftResult } from '@/lib/ai';

const UUID = /^[0-9a-f-]{36}$/;
const MISSING = { ok: false, error: 'That could not be found. Reload the page and try again.' } as const;
const notes = (text: string) => String(text ?? '').trim().slice(0, 4000);

export async function aiProgramme(slug: string, programmeId: string, text: string, current: string): Promise<DraftResult<ProgrammeDraft>> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  if (!UUID.test(programmeId)) return MISSING;
  const [p] = await withUser(user.id, (tx) => tx<{ title: string; eligibility: string | null; tracks: string[]; capacity: number | null }[]>`
    select title, eligibility, tracks, capacity from public.programmes where id = ${programmeId} and tenant_id = ${hub.id}`);
  if (!p) return MISSING;
  return draftProgramme({ tenantId: hub.id, userId: user.id }, { hub: hub.name, ...p, current: String(current ?? '').slice(0, 8000), notes: notes(text) });
}

interface LessonContext { title: string; kind: string; minutes: number | null; body: string | null; course: string; module: string | null; course_id: string; module_id: string; position: number }

async function lessonContext(userId: string, hubId: string, lessonId: string): Promise<LessonContext | null> {
  if (!UUID.test(lessonId)) return null;
  const [l] = await withUser(userId, (tx) => tx<LessonContext[]>`
    select l.title, l.kind, l.minutes, l.body, l.course_id, l.module_id, l.position, c.title as course, m.title as module
    from public.lessons l join public.courses c on c.id = l.course_id left join public.course_modules m on m.id = l.module_id
    where l.id = ${lessonId} and l.tenant_id = ${hubId}`);
  return l ?? null;
}

// `current` is what is in the box now (it may not be saved yet).
export async function aiLesson(slug: string, lessonId: string, title: string, current: string, text: string): Promise<DraftResult<LessonDraft>> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const l = await lessonContext(user.id, hub.id, lessonId);
  if (!l) return MISSING;
  return draftLesson({ tenantId: hub.id, userId: user.id }, { course: l.course, module: l.module, title: String(title ?? '').trim().slice(0, 160) || l.title, kind: l.kind, minutes: l.minutes, current: String(current ?? '').slice(0, 50_000), notes: notes(text) });
}

export async function aiTranslate(slug: string, lessonId: string, title: string, body: string): Promise<DraftResult<Translation>> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const l = await lessonContext(user.id, hub.id, lessonId);
  if (!l) return MISSING;
  const text = String(body ?? '').trim();
  if (text.length < 20) return { ok: false, error: 'Write the English text first, then translate it.' };
  return translateLesson({ tenantId: hub.id, userId: user.id }, { title: String(title ?? '').trim().slice(0, 160) || l.title, body: text.slice(0, 50_000) });
}

// Questions are grounded in the lessons that come before the quiz in its module (or the course, when
// the module has none), so they test what learners have actually been taught.
export async function aiQuestions(slug: string, lessonId: string, count: number, text: string): Promise<DraftResult<DraftQuestion[]>> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const l = await lessonContext(user.id, hub.id, lessonId);
  if (!l || l.kind !== 'quiz') return MISSING;
  const material = await withUser(user.id, (tx) => tx<{ title: string; body: string | null; same: boolean }[]>`
    select l.title, l.body, l.module_id = ${l.module_id} as same from public.lessons l join public.course_modules m on m.id = l.module_id
    where l.course_id = ${l.course_id} and l.tenant_id = ${hub.id} and l.kind not in ('quiz', 'assignment') and l.id <> ${lessonId}
    order by m.position, l.position, l.created_at`);
  const pool = material.some((m) => m.same) ? material.filter((m) => m.same) : material;
  const joined = pool.map((m) => `## ${m.title}\n${m.body ?? ''}`).join('\n\n');
  const n = Math.max(1, Math.min(10, Math.round(Number(count) || 5)));
  return draftQuestions({ tenantId: hub.id, userId: user.id }, { course: l.course, title: l.title, intro: l.body, material: joined, count: n, notes: notes(text) });
}

// Any team member who can grade can ask for draft feedback. The learner's name, email and reference
// are never sent.
export async function aiFeedback(slug: string, submissionId: string, text: string, resubmit: boolean): Promise<DraftResult<FeedbackDraft>> {
  const { user, hub } = await hubAccess(slug);
  if (!UUID.test(submissionId)) return MISSING;
  const found = await withUser(user.id, async (tx) => {
    const [s] = await tx<{ lesson_id: string; lesson: string; instructions: string | null; body: string | null; url: string | null; file_name: string | null }[]>`
      select s.lesson_id, l.title as lesson, l.body as instructions, s.body, s.url, s.file_name
      from public.submissions s join public.lessons l on l.id = s.lesson_id where s.id = ${submissionId} and s.tenant_id = ${hub.id}`;
    if (!s) return null;
    const rubric = await tx<{ id: string; title: string; description: string | null; levels: RubricLevel[] }[]>`
      select id, title, description, levels from public.rubric_criteria where lesson_id = ${s.lesson_id} order by position, created_at`;
    return { s, rubric };
  });
  if (!found) return MISSING;
  const { s, rubric } = found;
  if (!s.body?.trim() && !s.url) return { ok: false, error: 'This work is a file only. Claude cannot read files, so write this feedback yourself.' };
  return draftFeedback({ tenantId: hub.id, userId: user.id }, {
    lesson: s.lesson, instructions: s.instructions, answer: s.body?.slice(0, 30_000) ?? null, link: s.url, file: Boolean(s.file_name),
    rubric: rubric.map((c) => ({ id: c.id, title: c.title, description: c.description, levels: c.levels })), notes: notes(text), resubmit: Boolean(resubmit),
  });
}
