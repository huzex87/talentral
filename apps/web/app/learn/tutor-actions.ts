'use server';
// Learners ask the AI course tutor (beta). See lib/tutor.ts.
import { requireUser } from '@/lib/auth';
import { askTutor, type TutorResult } from '@/lib/tutor';

export async function askTutorAction(cohortId: string, lessonId: string | null, question: string, lang: 'en' | 'ha'): Promise<TutorResult> {
  const user = await requireUser();
  const q = question.trim();
  if (!/^[0-9a-f-]{36}$/.test(cohortId) || (lessonId && !/^[0-9a-f-]{36}$/.test(lessonId))) return { ok: false, error: 'Not found.' };
  if (q.length < 3) return { ok: false, error: lang === 'ha' ? 'Rubuta tambayarka.' : 'Type your question first.' };
  return askTutor({ userId: user.id, cohortId, lessonId, question: q, lang: lang === 'ha' ? 'ha' : 'en' });
}
