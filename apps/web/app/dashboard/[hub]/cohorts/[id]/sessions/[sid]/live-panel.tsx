'use client';
import { useActionState, useState, useTransition } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { keepValues } from '@/lib/keep-values';
import { confirmRegister, saveSessionLinks, type FormState } from '../../../actions';

export function SessionLinksForm({ slug, sessionId, meetingUrl, recordingUrl }: { slug: string; sessionId: string; meetingUrl: string | null; recordingUrl: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSessionLinks.bind(null, slug, sessionId), {});
  const e = state.errors ?? {};
  return (
    <form onSubmit={keepValues(action)} className="grid gap-3">
      <Field label="Meeting link" htmlFor="sl-meeting" error={e.meeting_url} hint="Learners join from My learning from 10 minutes before the start. Joining marks them present.">
        <Input id="sl-meeting" name="meeting_url" type="url" defaultValue={meetingUrl ?? ''} placeholder="https://meet.google.com/…" />
      </Field>
      <Field label="Recording link" htmlFor="sl-recording" error={e.recording_url} hint="Add it after the class. Learners who missed it can watch it from My learning.">
        <Input id="sl-recording" name="recording_url" type="url" defaultValue={recordingUrl ?? ''} placeholder="https://drive.google.com/… or https://youtu.be/…" />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Saving…' : 'Save links'}</Button>
        {state.ok && <span className="text-sm text-teal-700">✓ {state.message}</span>}
      </div>
    </form>
  );
}

export function ConfirmRegister({ slug, sessionId, confirmedAt, started }: { slug: string; sessionId: string; confirmedAt: string | null; started: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<FormState | null>(null);
  if (confirmedAt) return <Alert tone="teal" title="Register confirmed">Confirmed on {confirmedAt}. Marks are final; joins and check-ins no longer change them.</Alert>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">Check the list below, fix any marks, then confirm. Learners without a mark are recorded absent. Please confirm within 48 hours of the session.</p>
      <Button disabled={pending || !started} onClick={() => { if (confirm('Confirm the register? Learners without a mark will be recorded absent.')) start(async () => setResult(await confirmRegister(slug, sessionId))); }}>
        {pending ? 'Confirming…' : 'Confirm register'}
      </Button>
      {result?.message && <Alert tone={result.ok ? 'teal' : 'amber'}>{result.message}</Alert>}
    </div>
  );
}
