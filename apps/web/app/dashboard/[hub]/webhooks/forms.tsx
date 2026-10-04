'use client';
import { useActionState, useState, useTransition } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { WEBHOOK_EVENTS } from '@talentral/domain';
import { Alert, Button, Field, Input } from '@/components/ui';
import { keepValues } from '@/lib/keep-values';
import { addWebhook, changeWebhook, sendWebhookTest, type WebhookState } from './actions';

export function AddWebhookForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<WebhookState, FormData>(addWebhook.bind(null, slug), {});
  const e = state.errors ?? {};
  return (
    <form onSubmit={keepValues(action)} className="space-y-5">
      {state.message && <Alert tone={state.ok ? 'teal' : 'danger'} title={state.message} />}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field label="Endpoint URL" htmlFor="wh-url" required error={e.url} hint="Where Talentral sends events. HTTPS only.">
          <Input id="wh-url" name="url" type="url" inputMode="url" placeholder="https://crm.yourhub.ng/talentral" autoCapitalize="none" spellCheck={false} aria-invalid={Boolean(e.url)} />
        </Field>
        <Field label="Description" htmlFor="wh-description" hint="Optional, for your team.">
          <Input id="wh-description" name="description" maxLength={120} placeholder="CRM sync" />
        </Field>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Events</legend>
        {e.events && <p className="mt-1 text-[13px] font-medium text-danger" role="alert">{e.events}</p>}
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {Object.entries(WEBHOOK_EVENTS).map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-white p-3 transition-colors has-[:checked]:border-blue/40 has-[:checked]:bg-blue-50/50">
              <input type="checkbox" name="events" value={key} defaultChecked={key.startsWith('application.')} className="mt-0.5 size-4" />
              <span className="min-w-0"><span className="block font-mono text-[13px] text-ink">{key}</span><span className="block text-[13px] text-muted">{label}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Adding…' : 'Add endpoint'}</Button>
    </form>
  );
}

export function SecretValue({ secret }: { secret: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <code className="min-w-0 truncate rounded-md border border-line bg-canvas px-2 py-1 font-mono text-[12px] text-ink-2" aria-label="Signing secret">{shown ? secret : `whsec_${'•'.repeat(20)}`}</code>
      <Button type="button" variant="ghost" size="sm" onClick={() => setShown(!shown)} aria-label={shown ? 'Hide signing secret' : 'Show signing secret'}>{shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}</Button>
      <Button type="button" variant="ghost" size="sm" aria-label="Copy signing secret"
        onClick={() => { void navigator.clipboard?.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
    </div>
  );
}

export function EndpointActions({ slug, id, active }: { slug: string; id: string; active: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<WebhookState | null>(null);
  const run = (fn: () => Promise<unknown>) => start(async () => { setResult(null); await fn(); });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={pending || !active} onClick={() => start(async () => setResult(await sendWebhookTest(slug, id)))}>Send test event</Button>
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(() => changeWebhook(slug, id, active ? 'pause' : 'resume'))}>{active ? 'Pause' : 'Resume'}</Button>
        <Button type="button" size="sm" variant="secondary" disabled={pending}
          onClick={() => { if (confirm('Replace the signing secret? Your receiver must use the new one straight away.')) run(() => changeWebhook(slug, id, 'roll')); }}>Replace secret</Button>
        <Button type="button" size="sm" variant="danger" disabled={pending}
          onClick={() => { if (confirm('Remove this endpoint? Its delivery history goes too.')) run(() => changeWebhook(slug, id, 'delete')); }}>Remove</Button>
      </div>
      {result?.message && <p role="status" className={`text-sm ${result.ok ? 'text-teal-700' : 'text-danger'}`}>{result.message}</p>}
    </div>
  );
}

export function RedeliverButton({ slug, endpoint, delivery }: { slug: string; endpoint: string; delivery: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<WebhookState | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => setResult(await sendWebhookTest(slug, endpoint, delivery)))}>
        {pending ? 'Sending…' : 'Resend'}
      </Button>
      {result && <span role="status" className={`text-xs ${result.ok ? 'text-teal-700' : 'text-danger'}`}>{result.ok ? 'Delivered' : 'Not delivered'}</span>}
    </span>
  );
}
