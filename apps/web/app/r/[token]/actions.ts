'use server';
// The one-tap answer from a candidate's reply link. No sign-in: the link itself is the key, and the
// database only accepts yes or no for the one role it was issued for.
import { withUser } from '@talentral/db';
import { allowFromAddress } from '@/lib/rate';
import { hashToken } from '@/lib/tokens';

export interface ReplyState { done?: 'confirmed' | 'declined'; error?: string }

export async function answerRole(token: string, interest: 'confirmed' | 'declined'): Promise<ReplyState> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return { error: 'This link is not valid.' };
  if (!(await allowFromAddress('replyLink'))) return { error: 'Too many tries. Wait a few minutes and try again.' };
  const [r] = await withUser(null, (tx) => tx<{ ok: boolean }[]>`select app.reply_by_link(${hashToken(token)}, ${interest}) as ok`);
  return r?.ok ? { done: interest } : { error: 'This link has expired or the role is no longer open to answers. Sign in to see your Passport instead.' };
}
