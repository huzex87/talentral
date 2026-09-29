'use server';
// What a learner does while studying. Every check (enrolment, unlock date, attempt limits,
// marking) happens in the database functions, so these actions only pass things through.
import { revalidatePath } from 'next/cache';
import { withUser } from '@talentral/db';
import { SUBMISSION_FILES } from '@talentral/domain';
import { requireUser } from '@/lib/auth';
import { translator } from '@/lib/i18n';
import { accept, prepare, type PrepareResult } from '@/lib/uploads';

const UUID = /^[0-9a-f-]{36}$/;

export async function completeLesson(cohortId: string, lessonId: string): Promise<boolean> {
  const user = await requireUser();
  const [r] = await withUser(user.id, (tx) => tx<{ ok: boolean }[]>`select app.record_progress(${cohortId}, ${lessonId}, true) as ok`);
  revalidatePath(`/learn/${cohortId}`, 'layout');
  return Boolean(r?.ok);
}

export type QuizResult = { ok: true; score: number; max: number; percent: number; passed: boolean; attempts: number } | { ok: false; message: string; retry?: boolean };

// Answers carry a client id made on the device: if the connection drops and the device sends
// them again, the attempt still counts once.
export async function submitQuiz(cohortId: string, lessonId: string, answers: Record<string, string[]>, clientId: string): Promise<QuizResult> {
  const user = await requireUser();
  const t = translator(user.language);
  if (!UUID.test(cohortId) || !UUID.test(lessonId) || !UUID.test(clientId)) return { ok: false, message: t('Something went wrong. Reload the page.', 'Wani abu ya faru. Sake loda shafin.') };
  const clean = Object.fromEntries(Object.entries(answers).filter(([k]) => UUID.test(k)).map(([k, v]) => [k, (Array.isArray(v) ? v : []).map(String).slice(0, 8)]));
  try {
    const [r] = await withUser(user.id, (tx) => tx<{ score: string; max_score: number; percent: string; passed: boolean; attempts: string }[]>`
      select * from app.submit_quiz(${cohortId}, ${lessonId}, ${tx.json(clean)}, ${clientId})`);
    revalidatePath(`/learn/${cohortId}`, 'layout');
    return { ok: true, score: Number(r!.score), max: r!.max_score, percent: Number(r!.percent), passed: r!.passed, attempts: Number(r!.attempts) };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'P0002') return { ok: false, message: t('You have used all your attempts for this quiz.', 'Ka yi amfani da duk damarka a wannan jarrabawar.') };
    if (code === '42501') return { ok: false, message: t('This quiz is not open to you.', 'Wannan jarrabawar ba a buɗe take gare ka ba.') };
    throw e;
  }
}

async function tenantOf(userId: string, cohortId: string, lessonId: string): Promise<string | null> {
  const [r] = await withUser(userId, (tx) => tx<{ l: { tenant_id: string } | null }[]>`select app.learner_lesson(${cohortId}, ${lessonId}) as l`);
  return r?.l?.tenant_id ?? null;
}

export async function prepareSubmissionUpload(cohortId: string, lessonId: string, name: string, type: string, size: number): Promise<PrepareResult> {
  const user = await requireUser();
  const t = translator(user.language);
  const tenant = await tenantOf(user.id, cohortId, lessonId);
  if (!tenant) return { ok: false, error: t('This assignment is not open to you.', 'Wannan aikin ba a buɗe yake gare ka ba.') };
  return prepare(`tenants/${tenant}/submissions/`, SUBMISSION_FILES, name, type, size);
}

export interface SubmitState { ok?: boolean; message?: string; errors?: Record<string, string> }

export async function submitAssignment(cohortId: string, lessonId: string, _prev: SubmitState, form: FormData): Promise<SubmitState> {
  const user = await requireUser();
  const t = translator(user.language);
  const tenant = await tenantOf(user.id, cohortId, lessonId);
  if (!tenant) return { message: t('This assignment is not open to you.', 'Wannan aikin ba a buɗe yake gare ka ba.') };
  const body = String(form.get('body') ?? '').trim().slice(0, 20000);
  const url = String(form.get('url') ?? '').trim();
  const errors: Record<string, string> = {};
  if (url && !/^https?:\/\/\S+\.\S+/.test(url)) errors.url = t('Enter a full link starting with https://', 'Rubuta cikakkiyar hanya mai farawa da https://');
  const file = await accept(form, 'file', `tenants/${tenant}/submissions/`, SUBMISSION_FILES);
  if (file && 'error' in file) errors.file = file.error;
  if (Object.keys(errors).length) return { errors, message: t('Please check the highlighted fields.', 'Da fatan ka duba wuraren da aka yi wa alama.') };
  const f = file && !('error' in file) ? file : null;
  if (!body && !url && !f) return { message: t('Add your answer, a link or a file before handing in.', 'Ƙara amsarka, hanya ko fayil kafin ka mika.') };
  try {
    await withUser(user.id, (tx) => tx`select app.submit_assignment(${cohortId}, ${lessonId}, ${body || null}, ${url || null},
      ${f?.path ?? null}, ${f?.name ?? null}, ${f?.type ?? null}, ${f?.size ?? null})`);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'P0002') return { message: t('Your work is waiting to be graded.', 'Aikinka yana jiran a duba shi.') };
    if (code === 'P0003') return { message: t('Your work has already been graded.', 'An riga an duba aikinka.') };
    throw e;
  }
  revalidatePath(`/learn/${cohortId}`, 'layout');
  return { ok: true, message: t('Handed in. Your hub will grade it and you will see the feedback here.', 'An mika. Cibiyarka za ta duba shi kuma za ka ga ra’ayinsu a nan.') };
}

export interface OfflineItem { lessonId: string; moduleId: string; kind: string; file: boolean; bytes: number; online: boolean }

// What a module (or the whole course) needs to work offline: each open lesson's page, and its
// uploaded file if it has one. Videos on YouTube or Vimeo cannot be saved and are marked online.
export async function offlinePlan(cohortId: string, moduleId?: string): Promise<OfflineItem[]> {
  const user = await requireUser();
  if (!UUID.test(cohortId) || (moduleId && !UUID.test(moduleId))) return [];
  return withUser(user.id, async (tx) => {
    const rows = (await tx<{ lesson_id: string; module_id: string; kind: string; open: boolean }[]>`
      select lesson_id, module_id, kind, open from app.learner_outline(${cohortId})`).filter((r) => r.open && (!moduleId || r.module_id === moduleId));
    const items: OfflineItem[] = [];
    for (const r of rows) {
      const [row] = await tx<{ l: { has_file: boolean; file_size: number | null; media_url: string | null } | null }[]>`
        select app.learner_lesson(${cohortId}, ${r.lesson_id}) as l`;
      if (!row?.l) continue;
      items.push({ lessonId: r.lesson_id, moduleId: r.module_id, kind: r.kind, file: row.l.has_file, bytes: Number(row.l.file_size ?? 0),
        online: r.kind === 'video' && !row.l.has_file && Boolean(row.l.media_url) });
    }
    return items;
  });
}
