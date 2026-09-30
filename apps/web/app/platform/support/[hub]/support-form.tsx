'use client';
import { useActionState } from 'react';
import { Alert, Field, Textarea } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { startSupport, type SupportState } from '../actions';

export function SupportForm({ slug, hub }: { slug: string; hub: string }) {
  const [state, action] = useActionState<SupportState, FormData>(startSupport.bind(null, slug), {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Why do you need access?" htmlFor="sp-reason" required hint={`${hub}’s owners will see this.`}>
        <Textarea id="sp-reason" name="reason" rows={3} maxLength={500} placeholder="For example: the owner asked for help setting up the course for Cohort 2." />
      </Field>
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <SubmitButton pendingLabel="Opening…">Open for four hours</SubmitButton>
    </form>
  );
}
