'use client';
import { useActionState } from 'react';
import { NIGERIAN_STATES } from '@talentral/domain';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { keepValues } from '@/lib/keep-values';
import { submitJoin, type JoinState } from '@/app/join-actions';

// "I run a hub": register interest in becoming a founding hub.
export function JoinForm() {
  const [state, action, pending] = useActionState<JoinState, FormData>(submitJoin, {});
  const e = state.errors ?? {};
  const v = (k: string) => state.values?.[k] ?? '';

  if (state.ok) {
    return (
      <div className="rounded-[var(--radius-card)] border border-teal/30 bg-teal-50 p-6 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-teal text-xl text-white">✓</span>
        <p className="mt-3 font-display text-xl font-semibold">Enquiry received</p>
        <p className="mt-1 text-[15px] text-teal-700">{state.message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={keepValues(action)} className="space-y-4" noValidate>
      {state.message && <Alert tone="danger" title={state.message} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Hub or organisation" htmlFor="j-hub" required error={e.hub}><Input id="j-hub" name="hub" defaultValue={v('hub')} autoComplete="organization" /></Field>
        <Field label="Your name" htmlFor="j-contact" required error={e.contact}><Input id="j-contact" name="contact" defaultValue={v('contact')} autoComplete="name" /></Field>
        <Field label="Email" htmlFor="j-email" required error={e.email}><Input id="j-email" name="email" type="email" inputMode="email" defaultValue={v('email')} autoComplete="email" /></Field>
        <Field label="Phone (WhatsApp)" htmlFor="j-phone" required error={e.phone}><Input id="j-phone" name="phone" type="tel" inputMode="tel" placeholder="0803 123 4567" defaultValue={v('phone')} autoComplete="tel" /></Field>
        <Field label="State" htmlFor="j-state" error={e.state}>
          <Select id="j-state" name="state" defaultValue={v('state')}><option value="">Choose a state</option>{NIGERIAN_STATES.map((s) => <option key={s}>{s}</option>)}</Select>
        </Field>
        <Field label="Learners per cohort" htmlFor="j-size" error={e.size}>
          <Select id="j-size" name="size" defaultValue={v('size')}><option value="">Choose a range</option>{['Under 50', '50 to 100', '100 to 250', '250 to 500', 'Over 500'].map((s) => <option key={s}>{s}</option>)}</Select>
        </Field>
      </div>
      <Field label="Anything we should know?" htmlFor="j-message" error={e.message} hint="Programmes you run, funders you work with, when your next cohort starts.">
        <Textarea id="j-message" name="message" rows={3} maxLength={2000} defaultValue={v('message')} />
      </Field>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Button type="submit" disabled={pending} aria-busy={pending} className="w-full sm:w-auto">{pending ? 'Sending…' : 'Register interest'}</Button>
      <p className="text-xs text-muted">We reply within two working days. Your details are used only to contact you about Talentral.</p>
    </form>
  );
}
