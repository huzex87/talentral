'use client';
import { useActionState, useCallback, useState } from 'react';
import { FILE_TYPES, MAX_FILE_BYTES, type FormField } from '@talentral/domain';
import { Alert, Field, Input, Select, Textarea } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { prepareUpload, submitApplication, type ApplyState } from './actions';

// Documents normally go straight to storage. When that is unavailable they travel with the form,
// which the host caps at 4.5 MB per request, so keep a margin for the rest of the answers.
const FORM_FILE_LIMIT = 4 * 1024 * 1024;

interface Props {
  whatsapp?: boolean;
  programmeId: string;
  fields: FormField[];
  tracks: string[];
  hubName: string;
  disabled?: boolean;
}

export function ApplicationForm({ programmeId, fields, tracks, hubName, disabled, whatsapp = false }: Props) {
  const [state, action] = useActionState<ApplyState, FormData>(submitApplication.bind(null, programmeId), { attempt: 0 });
  const err = state.errors ?? {};
  const val = (k: string) => (state.values?.[k] as string | undefined) ?? '';
  const invalid = (k: string) => (err[k] ? { 'aria-invalid': true as const, 'aria-describedby': `${k}-error` } : {});
  // Number of documents still uploading; the form cannot be sent until they finish.
  const [busy, setBusy] = useState(0);
  const onBusy = useCallback((delta: number) => setBusy((n) => Math.max(0, n + delta)), []);

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
        {whatsapp && <label className="flex items-start gap-3 rounded-[var(--radius-control)] border border-line bg-canvas/40 px-4 py-3 text-sm">
          <input type="checkbox" name="whatsapp" defaultChecked={val('whatsapp') === 'on'} className="mt-0.5 size-4 shrink-0 accent-[#25D366]" />
          <span><b>Send me updates on WhatsApp</b> <span className="text-muted">(optional). Class reminders and messages from the hub come to this number on WhatsApp instead of SMS. Reply STOP at any time.</span></span>
        </label>}
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
          {fields.map((f) => f.type === 'file'
            ? <FileQuestion key={f.id} field={f} programmeId={programmeId} error={err[f.id]} initial={val(`a.${f.id}.uploaded`)} onBusy={onBusy} />
            : <Question key={f.id} field={f} error={err[f.id]} value={state.values?.[`a.${f.id}`]} />)}
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

      <SubmitButton variant="hub" className="w-full sm:w-auto" pendingLabel="Sending your application…" disabled={disabled || busy > 0}>
        {busy > 0 ? 'Uploading your documents…' : 'Submit application'}
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
    default:
      control = <Input id={id} name={id} maxLength={f.maxLength ?? 200} defaultValue={text} required={f.required} {...a11y} />;
  }
  return <Field label={f.label} htmlFor={id} required={f.required} hint={f.help} error={error}>{control}</Field>;
}

interface Uploaded { path: string; name: string; type: string; size: number }
type UploadState =
  | { kind: 'idle' }
  | { kind: 'uploading'; name: string; progress: number }
  | { kind: 'done'; file: Uploaded }
  | { kind: 'inline'; name: string } // sent with the form instead
  | { kind: 'error'; message: string };

const formatSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

function putFile(url: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`status ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(file);
  });
}

// A document question. The file uploads as soon as it is chosen, with progress, so slow connections
// see what is happening and a failed submission does not have to send it again.
function FileQuestion({ field: f, programmeId, error, initial, onBusy }: {
  field: FormField; programmeId: string; error?: string; initial: string; onBusy: (delta: number) => void;
}) {
  const id = `a.${f.id}`;
  const accept = f.accept ?? FILE_TYPES;
  const [state, setState] = useState<UploadState>(() => {
    try { return initial ? { kind: 'done', file: JSON.parse(initial) as Uploaded } : { kind: 'idle' }; } catch { return { kind: 'idle' }; }
  });

  async function choose(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) { setState({ kind: 'idle' }); return; }
    if (!accept.includes(file.type)) { input.value = ''; setState({ kind: 'error', message: 'Choose a PDF, JPEG or PNG file.' }); return; }
    if (file.size > MAX_FILE_BYTES) { input.value = ''; setState({ kind: 'error', message: `This file is ${formatSize(file.size)}. Files must be 5 MB or smaller.` }); return; }

    onBusy(1);
    setState({ kind: 'uploading', name: file.name, progress: 0 });
    try {
      const prep = await prepareUpload(programmeId, f.id, file.name, file.type, file.size);
      if (!prep.ok) { input.value = ''; setState({ kind: 'error', message: prep.error }); return; }
      if (prep.url) {
        try {
          await putFile(prep.url, file, (p) => setState({ kind: 'uploading', name: file.name, progress: p }));
          setState({ kind: 'done', file: { path: prep.path, name: file.name, type: file.type, size: file.size } });
          return;
        } catch { /* fall back to sending it with the form */ }
      }
      if (file.size > FORM_FILE_LIMIT) {
        input.value = '';
        setState({ kind: 'error', message: 'We could not upload this file on your connection. Try again, or choose a file under 4 MB.' });
        return;
      }
      setState({ kind: 'inline', name: file.name });
    } catch {
      setState({ kind: 'inline', name: file.name });
    } finally {
      onBusy(-1);
    }
  }

  const done = state.kind === 'done' ? state.file : null;
  const message = state.kind === 'error' ? state.message : error;
  return (
    <Field label={f.label} htmlFor={id} required={f.required} error={message}
      hint={[f.help, `${accept.includes('application/pdf') ? 'PDF, JPEG or PNG' : 'JPEG or PNG'}, up to 5 MB.`].filter(Boolean).join(' ')}>
      {done && (
        <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-teal/40 bg-teal/5 px-3 py-2.5 text-sm">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-teal text-white" aria-hidden>✓</span>
          <span className="min-w-0 flex-1 truncate font-semibold">{done.name}</span>
          <span className="shrink-0 text-muted">{formatSize(done.size)}</span>
          <input type="hidden" name={`${id}.uploaded`} value={JSON.stringify(done)} />
        </div>
      )}
      {state.kind === 'uploading' && (
        <div className="space-y-1.5 rounded-[var(--radius-control)] border border-line bg-white px-3 py-2.5 text-sm" role="status" aria-live="polite">
          <div className="flex justify-between gap-3"><span className="truncate font-semibold">{state.name}</span><span className="text-muted">Uploading {Math.round(state.progress * 100)}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-[var(--hub)] transition-[width]" style={{ width: `${Math.max(4, state.progress * 100)}%` }} /></div>
        </div>
      )}
      <input id={id} type="file" accept={accept.join(',')}
        // Named (and so sent with the form) unless the file already went to storage directly.
        name={done ? undefined : id}
        onChange={(e) => { void choose(e.currentTarget); }}
        aria-invalid={message ? true : undefined}
        aria-label={done ? `Replace ${f.label}` : undefined}
        className="block w-full rounded-[var(--radius-control)] border border-dashed border-line bg-white p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-canvas file:px-3 file:py-2 file:font-semibold" />
      {done && <p className="text-[13px] text-muted">Choose another file to replace it.</p>}
    </Field>
  );
}
