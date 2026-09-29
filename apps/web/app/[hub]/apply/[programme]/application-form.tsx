'use client';
import { useActionState } from 'react';
import type { FormField } from '@talentral/domain';
import { Alert, Field, Input, Select, Textarea } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { submitApplication, type ApplyState } from './actions';

interface Props {
  programmeId: string;
  fields: FormField[];
  tracks: string[];
  hubName: string;
  disabled?: boolean;
}

export function ApplicationForm({ programmeId, fields, tracks, hubName, disabled }: Props) {
  const [state, action] = useActionState<ApplyState, FormData>(submitApplication.bind(null, programmeId), { attempt: 0 });
  const err = state.errors ?? {};
  const val = (k: string) => (state.values?.[k] as string | undefined) ?? '';
  const invalid = (k: string) => (err[k] ? { 'aria-invalid': true as const, 'aria-describedby': `${k}-error` } : {});

  return (
    <form key={state.attempt} action={action} className="space-y-6" noValidate>
      {state.message && <Alert tone="danger" title={state.message} />}

      <fieldset className="space-y-5" disabled={disabled}>
        <legend className="mb-1 text-lg font-semibold">About you</legend>
        <Field label="Full name" htmlFor="full_name" required error={err.full_name}>
          <Input id="full_name" name="full_name" autoComplete="name" defaultValue={val('full_name')} required {...invalid('full_name')} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Email address" htmlFor="email" required error={err.email} hint="We send your confirmation and updates here.">
            <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={val('email')} required {...invalid('email')} />
          </Field>
          <Field label="Phone number" htmlFor="phone" required error={err.phone} hint="Preferably one on WhatsApp.">
            <Input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="0803 123 4567" defaultValue={val('phone')} required {...invalid('phone')} />
          </Field>
        </div>
        {tracks.length > 0 && (
          <Field label="Which track are you applying for?" htmlFor="track" required error={err.track}>
            <Select id="track" name="track" defaultValue={val('track')} required {...invalid('track')}>
              <option value="" disabled>Choose a track</option>
              {tracks.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </Field>
        )}
      </fieldset>

      {fields.length > 0 && (
        <fieldset className="space-y-5" disabled={disabled}>
          <legend className="mb-1 text-lg font-semibold">Your application</legend>
          {fields.map((f) => <Question key={f.id} field={f} error={err[f.id]} value={state.values?.[`a.${f.id}`]} />)}
        </fieldset>
      )}

      <div className="rounded-[var(--radius-control)] border border-line bg-canvas p-4">
        <label className="flex gap-3 text-sm leading-relaxed">
          <input type="checkbox" name="consent" className="mt-1 size-4 shrink-0 accent-[var(--hub)]" disabled={disabled} {...invalid('consent')} />
          <span>
            I agree that {hubName} and Talentral may process the information in this application to assess it, contact me about this programme
            and report anonymised statistics to its funders, as described under the Nigeria Data Protection Act 2023.
          </span>
        </label>
        {err.consent && <p id="consent-error" className="mt-2 text-[13px] font-medium text-danger">{err.consent}</p>}
      </div>

      {/* Honeypot: hidden from people, filled by bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

      <SubmitButton variant="hub" className="w-full sm:w-auto" pendingLabel="Sending your application…" disabled={disabled}>
        Submit application
      </SubmitButton>
    </form>
  );
}

function Question({ field: f, error, value }: { field: FormField; error?: string; value?: string | string[] }) {
  const id = `a.${f.id}`;
  const a11y = error ? { 'aria-invalid': true as const } : {};
  const text = typeof value === 'string' ? value : '';
  let control: React.ReactNode;
  switch (f.type) {
    case 'long_text':
      control = <Textarea id={id} name={id} maxLength={f.maxLength ?? 3000} defaultValue={text} required={f.required} {...a11y} />;
      break;
    case 'number':
      control = <Input id={id} name={id} type="number" inputMode="decimal" defaultValue={text} required={f.required} {...a11y} />;
      break;
    case 'date':
      control = <Input id={id} name={id} type="date" defaultValue={text} required={f.required} {...a11y} />;
      break;
    case 'select':
      control = (
        <Select id={id} name={id} defaultValue={text} required={f.required} {...a11y}>
          <option value="" disabled={f.required}>Choose an option</option>
          {(f.options ?? []).map((o) => <option key={o}>{o}</option>)}
        </Select>
      );
      break;
    case 'multi_select': {
      const chosen = Array.isArray(value) ? value : [];
      control = (
        <div className="grid gap-2 sm:grid-cols-2">
          {(f.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2.5 rounded-[var(--radius-control)] border border-line bg-white px-3 py-2.5 text-[15px]">
              <input type="checkbox" name={id} value={o} defaultChecked={chosen.includes(o)} className="size-4 accent-[var(--hub)]" />
              {o}
            </label>
          ))}
        </div>
      );
      break;
    }
    case 'yes_no':
      control = (
        <div className="flex gap-3">
          {['yes', 'no'].map((o) => (
            <label key={o} className="flex items-center gap-2 rounded-[var(--radius-control)] border border-line bg-white px-4 py-2.5 text-[15px] capitalize">
              <input type="radio" name={id} value={o} defaultChecked={text === o} className="size-4 accent-[var(--hub)]" />{o}
            </label>
          ))}
        </div>
      );
      break;
    case 'file':
      control = (
        <input id={id} name={id} type="file" accept={(f.accept ?? ['application/pdf', 'image/jpeg', 'image/png']).join(',')}
          className="block w-full rounded-[var(--radius-control)] border border-dashed border-line bg-white p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-canvas file:px-3 file:py-2 file:font-semibold"
          {...a11y} />
      );
      break;
    default:
      control = <Input id={id} name={id} maxLength={f.maxLength ?? 200} defaultValue={text} required={f.required} {...a11y} />;
  }
  const hint = f.type === 'file' ? [f.help, 'PDF, JPEG or PNG, up to 5 MB. If you see an error, attach the file again.'].filter(Boolean).join(' ') : f.help;
  return <Field label={f.label} htmlFor={id} required={f.required} hint={hint} error={error}>{control}</Field>;
}
