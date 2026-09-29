'use client';
import { useActionState } from 'react';
import { keepValues } from '@/lib/keep-values';
import { NIGERIAN_STATES } from '@talentral/domain';
import { Alert, Field, Input, Select, Textarea } from '@/components/ui';
import { Button } from '@/components/ui';
import { registerEmployer, type RegisterState } from './actions';

export function RegisterEmployerForm() {
  const [state, action, pending] = useActionState<RegisterState, FormData>(registerEmployer, {});
  const e = state.errors ?? {};
  const v = state.values ?? {};
  if (state.ok) {
    return (
      <div className="rounded-2xl border border-teal-700/20 bg-teal-50 p-6 text-center" role="status">
        <span aria-hidden className="mx-auto flex size-12 items-center justify-center rounded-full bg-teal-700 text-xl text-white">✓</span>
        <h3 className="mt-3 font-display text-xl font-semibold text-teal-700">Check your email</h3>
        <p className="mt-1 text-[15px] text-teal-700">{state.message}</p>
      </div>
    );
  }
  return (
    <form onSubmit={keepValues(action)} className="grid gap-4 sm:grid-cols-2" noValidate>
      {state.message && <div className="sm:col-span-2"><Alert tone="danger">{state.message}</Alert></div>}
      <input type="text" name="company_url" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Field label="Organisation name" htmlFor="er-name" required error={e.name}><Input id="er-name" name="name" defaultValue={v.name} autoComplete="organization" /></Field>
      <Field label="Sector" htmlFor="er-sector" required error={e.sector}><Input id="er-sector" name="sector" defaultValue={v.sector} placeholder="Software, marketing agency, BPO…" /></Field>
      <Field label="Website" htmlFor="er-web" error={e.website}><Input id="er-web" name="website" type="url" defaultValue={v.website} placeholder="https://" /></Field>
      <Field label="State" htmlFor="er-state" error={e.state}>
        <Select id="er-state" name="state" defaultValue={v.state ?? ''}><option value="">Choose a state</option>{NIGERIAN_STATES.map((s) => <option key={s}>{s}</option>)}</Select>
      </Field>
      <Field label="Team size" htmlFor="er-size" required error={e.size}>
        <Select id="er-size" name="size" defaultValue={v.size ?? ''}><option value="">Choose</option>{['1-10', '11-50', '51-200', '201+'].map((s) => <option key={s} value={s}>{s} people</option>)}</Select>
      </Field>
      <Field label="Your name" htmlFor="er-contact" required error={e.contact_name}><Input id="er-contact" name="contact_name" defaultValue={v.contact_name} autoComplete="name" /></Field>
      <Field label="Work email" htmlFor="er-email" required error={e.email} hint="We send your sign-in link here."><Input id="er-email" name="email" type="email" defaultValue={v.email} autoComplete="email" /></Field>
      <Field label="Phone" htmlFor="er-phone" required error={e.phone}><Input id="er-phone" name="phone" type="tel" defaultValue={v.phone} autoComplete="tel" placeholder="0803 123 4567" /></Field>
      <div className="sm:col-span-2">
        <Field label="Roles you hire for" htmlFor="er-hiring" required error={e.hiring}>
          <Textarea id="er-hiring" name="hiring" rows={3} defaultValue={v.hiring} placeholder="Two junior frontend developers (remote) and a social media executive in Kano." />
        </Field>
      </div>
      <label className="flex items-start gap-3 text-sm sm:col-span-2">
        <input type="checkbox" name="terms" className="mt-0.5 size-4 accent-[var(--color-blue)]" />
        <span>I will use candidate information only to recruit for real roles, and I will not charge candidates any fee. <span className="text-muted">Talentral follows the employer-pays principle.</span>
          {e.terms && <span className="mt-1 block font-semibold text-danger">{e.terms}</span>}</span>
      </label>
      <div className="sm:col-span-2"><Button type="submit" disabled={pending} aria-busy={pending} className="w-full sm:w-auto">{pending ? 'Registering…' : 'Register and get my sign-in link'}</Button></div>
    </form>
  );
}
