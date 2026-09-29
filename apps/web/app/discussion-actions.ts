'use server';
// Cohort discussions, for learners and the hub team alike. Who may read, post and moderate is
// decided in the database (app.discussion_role and the functions around it).
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { withUser } from '@talentral/db';
import { requireUser } from '@/lib/auth';
import { translator } from '@/lib/i18n';

const UUID = /^[0-9a-f-]{36}$/;

export interface PostState { ok?: boolean; error?: string; at?: number }

function refresh() {
  revalidatePath('/learn', 'layout');
  revalidatePath('/dashboard', 'layout');
}

export async function startThread(cohortId: string, back: string, _prev: PostState, form: FormData): Promise<PostState> {
  const user = await requireUser();
  const t = translator(user.language);
  const title = String(form.get('title') ?? '').trim();
  const body = String(form.get('body') ?? '').trim();
  if (!UUID.test(cohortId)) return { error: t('Something went wrong. Reload the page.', 'Wani abu ya faru. Sake loda shafin.') };
  if (title.length < 3 || title.length > 160) return { error: t('Give your question a title of 3 to 160 characters.', 'Ba tambayarka take mai haruffa 3 zuwa 160.') };
  if (!body || body.length > 5000) return { error: t('Write your question (up to 5,000 characters).', 'Rubuta tambayarka (har haruffa 5,000).') };
  const [r] = await withUser(user.id, (tx) => tx<{ id: string }[]>`select app.start_thread(${cohortId}, ${title}, ${body}) as id`);
  refresh();
  redirect(`${back}/${r!.id}`);
}

export async function replyToThread(threadId: string, _prev: PostState, form: FormData): Promise<PostState> {
  const user = await requireUser();
  const t = translator(user.language);
  const body = String(form.get('body') ?? '').trim();
  if (!UUID.test(threadId)) return { error: t('Something went wrong. Reload the page.', 'Wani abu ya faru. Sake loda shafin.') };
  if (!body || body.length > 5000) return { error: t('Write a reply (up to 5,000 characters).', 'Rubuta amsa (har haruffa 5,000).') };
  try {
    await withUser(user.id, (tx) => tx`select app.reply_to_thread(${threadId}, ${body})`);
  } catch (e) {
    if ((e as { code?: string }).code === 'P0001') return { error: t('This discussion is closed.', 'An rufe wannan tattaunawar.') };
    throw e;
  }
  refresh();
  return { ok: true, at: Date.now() };
}

export async function moderateThread(threadId: string, change: { pinned: boolean; locked: boolean; hidden: boolean }): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, (tx) => tx`select app.moderate_thread(${threadId}, ${change.pinned}, ${change.locked}, ${change.hidden})`);
  refresh();
}

export async function moderatePost(postId: string, hidden: boolean): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, (tx) => tx`select app.moderate_post(${postId}, ${hidden})`);
  refresh();
}
