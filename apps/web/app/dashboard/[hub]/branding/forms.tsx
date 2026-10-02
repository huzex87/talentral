'use client';
import { useActionState, useState, useTransition } from 'react';
import { Alert, Button, Field, Input, Textarea } from '@/components/ui';
import { keepValues } from '@/lib/keep-values';
import { checkDomainNow, saveDomain, saveEmailBrand, type BrandingState } from './actions';

export function DomainForm({ slug, current }: { slug: string; current: string | null }) {
  const [state, action, pending] = useActionState<BrandingState, FormData>(saveDomain.bind(null, slug), {});
  return (
    <form onSubmit={keepValues(action)} className="space-y-3">
      <Field label={current ? 'Change domain' : 'Your domain'} htmlFor="domain" error={state.errors?.domain}
        hint="A subdomain your organisation owns, such as apply.yourhub.ng or learn.yourhub.ng.">
        <Input id="domain" name="domain" defaultValue={current ?? ''} placeholder="apply.yourhub.ng" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Saving…' : 'Save domain'}</Button>
        {state.message && <span role="status" className={`text-sm ${state.ok ? 'text-teal-700' : 'text-danger'}`}>{state.message}</span>}
      </div>
    </form>
  );
}

export function CheckDomainButton({ slug }: { slug: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<BrandingState | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="secondary" disabled={pending} aria-busy={pending} onClick={() => start(async () => setResult(await checkDomainNow(slug)))}>
        {pending ? 'Checking…' : 'Check DNS now'}
      </Button>
      {result?.message && <span role="status" className={`text-sm ${result.ok ? 'text-teal-700' : 'text-danger'}`}>{result.message}</span>}
    </div>
  );
}

export function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" onClick={() => { void navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="rounded-md border border-line px-2 py-0.5 text-xs font-semibold text-muted hover:border-blue/40 hover:text-blue" aria-label={`Copy ${label}`}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function EmailBrandForm({ slug, values, hubName, contact }: { slug: string; values: { email_from_name: string | null; email_reply_to: string | null; email_footer: string | null }; hubName: string; contact: string | null }) {
  const [state, action, pending] = useActionState<BrandingState, FormData>(saveEmailBrand.bind(null, slug), {});
  const e = state.errors ?? {};
  return (
    <form onSubmit={keepValues(action)} className="grid gap-4">
      <Field label="Sender name" htmlFor="email_from_name" error={e.email_from_name} hint={`Emails arrive from “${values.email_from_name || hubName} via Talentral”. Leave empty to use your hub name.`}>
        <Input id="email_from_name" name="email_from_name" defaultValue={values.email_from_name ?? ''} placeholder={hubName} maxLength={60} />
      </Field>
      <Field label="Replies go to" htmlFor="email_reply_to" error={e.email_reply_to} hint={contact ? `Leave empty to use your contact email, ${contact}.` : 'Applicants and learners reply to this address.'}>
        <Input id="email_reply_to" name="email_reply_to" type="email" defaultValue={values.email_reply_to ?? ''} placeholder={contact ?? 'hello@yourhub.ng'} />
      </Field>
      <Field label="Footer line" htmlFor="email_footer" error={e.email_footer} hint="Shown at the bottom of every email, for example your address or registration number.">
        <Textarea id="email_footer" name="email_footer" rows={2} defaultValue={values.email_footer ?? ''} maxLength={300} placeholder="No 12 Zaria Road, Kano · RC 1234567" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Saving…' : 'Save email settings'}</Button>
        {state.message && <span role="status" className={`text-sm ${state.ok ? 'text-teal-700' : 'text-danger'}`}>{state.message}</span>}
      </div>
      {state.ok && <Alert tone="teal">The preview updates when the page reloads.</Alert>}
    </form>
  );
}
