'use client';
import { useActionState } from 'react';
import { Field, Input, Select } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { createCohort, type FormState } from './actions';

export function NewCohortForm({ slug, programmes, defaultProgramme }: { slug: string; programmes: { id: string; title: string; accepted: number }[]; defaultProgramme?: string }) {
  const [state, action] = useActionState<FormState, FormData>(createCohort.bind(null, slug), {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2">
      <Field label="Programme" htmlFor="c-programme" required error={e.programme}>
        <Select id="c-programme" name="programme" defaultValue={programmes.some((p) => p.id === defaultProgramme) ? defaultProgramme : programmes[0]?.id ?? ''}>
          {programmes.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.accepted} accepted)</option>)}
        </Select>
      </Field>
      <Field label="Cohort name" htmlFor="c-name" required error={e.name}><Input id="c-name" name="name" placeholder="Cohort 1" maxLength={120} /></Field>
      <Field label="Starts" htmlFor="c-start" error={e.starts_on}><Input id="c-start" name="starts_on" type="date" /></Field>
      <Field label="Ends" htmlFor="c-end" error={e.ends_on}><Input id="c-end" name="ends_on" type="date" /></Field>
      <Field label="Attendance needed to complete (%)" htmlFor="c-min" error={e.min_attendance} hint="Learners at or above this attendance are suggested for completion.">
        <Input id="c-min" name="min_attendance" type="number" inputMode="numeric" min={0} max={100} defaultValue={75} />
      </Field>
      <div className="flex justify-end border-t border-line pt-5 sm:col-span-2"><SubmitButton pendingLabel="Creating…">Create cohort</SubmitButton></div>
    </form>
  );
}
