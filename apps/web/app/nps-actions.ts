'use server';
import { withUser } from '@talentral/db';
import type { NpsAudience } from '@talentral/domain';
import { requireUser } from '@/lib/auth';

export interface NpsResult { ok: boolean; message?: string }

const UUID = /^[0-9a-f-]{36}$/;

// Records an NPS answer, or "Not now" when score is null. Nothing is revalidated, so the thank-you
// stays on screen; the prompt is gone on the next visit.
export async function submitNps(tenantId: string, cohortId: string | null, audience: NpsAudience, score: number | null, comment: string): Promise<NpsResult> {
  const user = await requireUser();
  if (!UUID.test(tenantId) || (cohortId !== null && !UUID.test(cohortId)) || (audience !== 'learner' && audience !== 'staff')) return { ok: false, message: 'Something went wrong. Please refresh the page.' };
  if (score !== null && (!Number.isInteger(score) || score < 0 || score > 10)) return { ok: false, message: 'Choose a score from 0 to 10.' };
  try {
    await withUser(user.id, (tx) => tx`select app.submit_nps(${tenantId}, ${cohortId}, ${audience}, ${score}, ${comment.slice(0, 1000)})`);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (/already answered/.test(msg)) return { ok: true };
    console.error('nps submit failed', e);
    return { ok: false, message: 'We could not save your answer. Please try again.' };
  }
}
