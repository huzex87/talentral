'use client';
import { useActionState } from 'react';
import { Alert, Field, Input, Textarea } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { askToCorrect, askToDelete, type RequestState } from './actions';

export function CorrectForm() {
  const [state, action] = useActionState<RequestState, FormData>(askToCorrect, {});
  return (
    <form key={state.ok ? 'sent' : 'form'} action={action} className="space-y-3">
      <Field label="What needs correcting?" htmlFor="pr-details" hint="For example: my name is spelt wrongly on my certificate, or my phone number has changed.">
        <Textarea id="pr-details" name="details" rows={3} maxLength={2000} />
      </Field>
      {state.message && <Alert tone={state.ok ? 'teal' : 'danger'}>{state.message}</Alert>}
      <SubmitButton variant="secondary" pendingLabel="Sending…">Ask for a correction</SubmitButton>
    </form>
  );
}

export function DeleteForm() {
  const [state, action] = useActionState<RequestState, FormData>(askToDelete, {});
  if (state.ok) return <Alert tone="teal">{state.message}</Alert>;
  return (
    <form action={action} className="space-y-3">
      <Field label="Why are you leaving? (optional)" htmlFor="pr-reason"><Input id="pr-reason" name="reason" maxLength={500} /></Field>
      <Field label="Type DELETE to confirm" htmlFor="pr-confirm" required><Input id="pr-confirm" name="confirm" autoComplete="off" className="max-w-48 font-mono uppercase" /></Field>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <SubmitButton variant="danger" pendingLabel="Sending…">Ask to delete my data</SubmitButton>
    </form>
  );
}
