'use client';
import { useActionState } from 'react';
import { Field, Input } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { createProgramme, type ProgState } from '../actions';

export function NewProgrammeForm({ slug }: { slug: string }) {
  const [state, action] = useActionState<ProgState, FormData>(createProgramme.bind(null, slug), {});
  return (
    <form action={action} className="space-y-5">
      <Field label="Programme title" htmlFor="title" hint="For example: iDICE Centre of Excellence, Cohort 1" error={state.errors?.title}>
        <Input id="title" name="title" required autoFocus maxLength={160} />
      </Field>
      <p className="text-sm text-muted">We start you with the recommended questions (gender, date of birth, state, LGA, education and more). You can change them on the next page.</p>
      <SubmitButton pendingLabel="Creating…">Create programme</SubmitButton>
    </form>
  );
}
