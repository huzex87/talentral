'use client';
import { useActionState, useEffect, useRef, useTransition } from 'react';
import type { Thread } from '@/lib/discussion-data';
import { moderatePost, moderateThread, replyToThread, startThread, type PostState } from '@/app/discussion-actions';
import { Alert, Button, Field, Input, Textarea } from './ui';
import { SubmitButton } from './submit-button';
import { keepValues } from '@/lib/keep-values';

type Lang = 'en' | 'ha';

export function NewThreadForm({ cohortId, base, lang }: { cohortId: string; base: string; lang: Lang }) {
  const [state, action] = useActionState<PostState, FormData>(startThread.bind(null, cohortId, base), {});
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  return (
    <form onSubmit={keepValues(action)} className="space-y-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label={t('Title', 'Take')} htmlFor="thread-title"><Input id="thread-title" name="title" maxLength={160} required placeholder={t('e.g. How do I link a CSS file?', 'misali: Yaya zan haɗa fayil ɗin CSS?')} /></Field>
      <Field label={t('Your question or post', 'Tambayarka ko rubutunka')} htmlFor="thread-body"><Textarea id="thread-body" name="body" rows={5} maxLength={5000} required /></Field>
      <SubmitButton pendingLabel={t('Posting…', 'Ana aikawa…')}>{t('Post', 'Aika')}</SubmitButton>
    </form>
  );
}

export function ReplyForm({ threadId, lang }: { threadId: string; lang: Lang }) {
  const [state, action] = useActionState<PostState, FormData>(replyToThread.bind(null, threadId), {});
  const ref = useRef<HTMLFormElement>(null);
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  // Clear the box after a successful reply; keep it on an error.
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state.ok, state.at]);
  return (
    <form ref={ref} onSubmit={keepValues(action)} className="space-y-3 rounded-xl border border-line bg-white p-4">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Field label={t('Your reply', 'Amsarka')} htmlFor="reply-body"><Textarea id="reply-body" name="body" rows={4} maxLength={5000} required /></Field>
      <SubmitButton pendingLabel={t('Sending…', 'Ana aikawa…')}>{t('Reply', 'Amsa')}</SubmitButton>
    </form>
  );
}

export function ThreadModeration({ thread }: { thread: Thread }) {
  const [pending, start] = useTransition();
  const change = (c: Partial<Pick<Thread, 'pinned' | 'locked' | 'hidden'>>) =>
    start(() => moderateThread(thread.id, { pinned: thread.pinned, locked: thread.locked, hidden: thread.hidden, ...c }));
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Moderation">
      <span className="mr-1 text-[13px] font-medium text-muted">Moderate</span>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => change({ pinned: !thread.pinned })}>{thread.pinned ? 'Unpin' : 'Pin'}</Button>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => change({ locked: !thread.locked })}>{thread.locked ? 'Reopen' : 'Close'}</Button>
      <Button size="sm" variant={thread.hidden ? 'secondary' : 'danger'} disabled={pending} onClick={() => change({ hidden: !thread.hidden })}>{thread.hidden ? 'Show to learners' : 'Hide'}</Button>
    </div>
  );
}

export function PostModeration({ id, hidden }: { id: string; hidden: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => moderatePost(id, !hidden))}
      className="rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-canvas hover:text-danger disabled:opacity-60">{hidden ? 'Show' : 'Hide'}</button>
  );
}
