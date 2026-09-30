'use client';
import { useActionState, useRef, useEffect } from 'react';
import { Alert, Field, Input, Textarea } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { recordIncident, type IncidentState } from './actions';

export function IncidentForm({ today }: { today: string }) {
  const [state, action] = useActionState<IncidentState, FormData>(recordIncident, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) form.current?.reset(); }, [state]);
  return (
    <form ref={form} action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
        <Field label="Date it happened" htmlFor="inc-date" required>
          <Input id="inc-date" name="occurred_on" type="date" max={today} defaultValue={today} required />
        </Field>
        <Field label="What happened" htmlFor="inc-summary" required hint="Facts only: what, which hubs, how it was found, what was done.">
          <Textarea id="inc-summary" name="summary" rows={3} minLength={10} maxLength={2000} required />
        </Field>
      </div>
      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-6">
        <label className="flex items-start gap-2"><input type="checkbox" name="cross_tenant" className="mt-0.5 size-4 accent-danger" /><span><b>Cross-tenant:</b> one hub’s data reached another hub</span></label>
        <label className="flex items-start gap-2"><input type="checkbox" name="personal_data" className="mt-0.5 size-4 accent-danger" /><span><b>Personal data</b> was exposed (report to the NDPC within 72 hours)</span></label>
      </div>
      {state.message && <Alert tone={state.ok ? 'teal' : 'danger'}>{state.message}</Alert>}
      <SubmitButton variant="secondary" pendingLabel="Recording…">Record incident</SubmitButton>
    </form>
  );
}
