'use client';
import { useActionState } from 'react';
import { Alert, Field, Input } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { sendLink, type SignInState } from './actions';

export function SignInForm() {
  const [state, action] = useActionState<SignInState, FormData>(sendLink, {});
  if (state.sent) {
    return (
      <Alert tone="teal" title="Check your email">
        If {state.email} belongs to a Talentral account, a sign-in link is on its way. It expires in 15 minutes.
      </Alert>
    );
  }
  return (
    <form action={action} className="space-y-5">
      <Field label="Email address" htmlFor="email" error={state.error}>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={state.email} required autoFocus />
      </Field>
      <SubmitButton className="w-full" pendingLabel="Sending link…">Email me a sign-in link</SubmitButton>
    </form>
  );
}
