'use server';
import { revalidatePath } from 'next/cache';
import { withUser } from '@talentral/db';
import { APPLICATION_STATUSES, STATUS_LABELS, canMove, scorePercent, validateScores, type ApplicationStatus, type Criterion } from '@talentral/domain';
import { requireSelector } from '@/lib/auth';
import { notifyStatusChange } from '@/lib/notify';

export async function moveApplication(slug: string, id: string, to: string, notify = false): Promise<{ ok: boolean; message: string }> {
  const { user, hub } = await requireSelector(slug);
  if (!(APPLICATION_STATUSES as readonly string[]).includes(to)) return { ok: false, message: 'Unknown status.' };
  const moved = await withUser(user.id, async (tx) => {
    const [a] = await tx<{ status: ApplicationStatus }[]>`select status from public.applications where id = ${id} and tenant_id = ${hub.id} for update`;
    if (!a || !canMove(a.status, to as ApplicationStatus)) return false;
    await tx`update public.applications set status = ${to} where id = ${id}`;
    return true;
  });
  if (!moved) return { ok: false, message: 'This application has changed. Refresh the page and try again.' };
  const emailed = notify ? await notifyStatusChange(user.id, hub.id, [id], to) : 0;
  revalidatePath(`/dashboard/${slug}/applications`, 'layout');
  const told = !emailed ? '' : to === 'accepted' ? ' We emailed the applicant a link to their learner account.' : ' The applicant has been emailed.';
  return { ok: true, message: `Moved to ${STATUS_LABELS[to as ApplicationStatus]}.${told}` };
}

// Sends the acceptance email again with a fresh welcome link, for applicants who lost it or let
// the link expire. Earlier links keep working until they expire.
export async function resendWelcome(slug: string, id: string): Promise<{ ok: boolean; message: string }> {
  const { user, hub } = await requireSelector(slug);
  const sent = await notifyStatusChange(user.id, hub.id, [id], 'accepted');
  return sent ? { ok: true, message: 'Welcome email sent with a new link.' } : { ok: false, message: 'We could not send it. Check the email address on the application.' };
}

export async function addNote(slug: string, id: string, form: FormData) {
  const { user, hub } = await requireSelector(slug);
  const body = String(form.get('body') ?? '').trim().slice(0, 2000);
  if (!body) return;
  await withUser(user.id, (tx) => tx`insert into public.application_notes (tenant_id, application_id, author_id, body) values (${hub.id}, ${id}, ${user.id}, ${body})`);
  revalidatePath(`/dashboard/${slug}/applications/${id}`);
}

export interface ScoreState { ok?: boolean; message?: string }

// Saves the signed-in reviewer's scoresheet (one per reviewer per application). The first score
// on a new application also moves it to "Under review", so the list shows what is being worked on.
export async function saveScore(slug: string, id: string, _prev: ScoreState, form: FormData): Promise<ScoreState> {
  const { user, hub } = await requireSelector(slug);
  const comment = String(form.get('comment') ?? '').trim().slice(0, 1000) || null;
  const raw: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) if (k.startsWith('score.')) raw[k.slice(6)] = v;

  const result = await withUser(user.id, async (tx) => {
    const [a] = await tx<{ status: ApplicationStatus; rubric: Criterion[] }[]>`
      select a.status, p.rubric from public.applications a join public.programmes p on p.id = a.programme_id
      where a.id = ${id} and a.tenant_id = ${hub.id} for update of a`;
    if (!a) return { message: 'Application not found.' };
    const checked = validateScores(a.rubric, raw);
    if (!checked.ok) return { message: checked.error };
    const percent = scorePercent(a.rubric, checked.scores);
    await tx`
      insert into public.application_scores (tenant_id, application_id, reviewer_id, scores, percent, comment)
      values (${hub.id}, ${id}, ${user.id}, ${tx.json(checked.scores)}, ${percent}, ${comment})
      on conflict (application_id, reviewer_id)
      do update set scores = excluded.scores, percent = excluded.percent, comment = excluded.comment, updated_at = now()`;
    if (a.status === 'submitted') await tx`update public.applications set status = 'under_review' where id = ${id}`;
    return { ok: true, message: `Score saved: ${percent}%.` };
  });
  revalidatePath(`/dashboard/${slug}/applications`, 'layout');
  return result;
}
