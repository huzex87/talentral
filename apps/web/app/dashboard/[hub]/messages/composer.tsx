'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { APPLICATION_STATUSES, MAX_SMS_SEGMENTS, PLACEHOLDERS, STATUS_LABELS, smsSegments } from '@talentral/domain';
import { Alert, Card, Field, Input, Select, Textarea, cx } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { countAudience, sendMessage, type Audience, type SendState } from './actions';

interface Props {
  slug: string;
  programmes: { id: string; title: string; tracks: string[] }[];
  initial: { programme?: string; status?: string; track?: string; extra: string };
  smsReady: boolean;
}

// Compose one message to a group of applicants, by email, text (WhatsApp or SMS) or both.
export function Composer({ slug, programmes, initial, smsReady }: Props) {
  const [state, action] = useActionState<SendState, FormData>(sendMessage.bind(null, slug), {});
  const [programme, setProgramme] = useState(initial.programme ?? '');
  const [status, setStatus] = useState(initial.status ?? '');
  const [track, setTrack] = useState(initial.track ?? '');
  const [email, setEmail] = useState(true);
  const [sms, setSms] = useState(false);
  const [body, setBody] = useState('');
  const [text, setText] = useState('');
  const [audience, setAudience] = useState<Audience | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const smsRef = useRef<HTMLTextAreaElement>(null);

  const params = new URLSearchParams(initial.extra);
  if (programme) params.set('programme', programme); else params.delete('programme');
  if (status) params.set('status', status); else params.delete('status');
  if (track) params.set('track', track); else params.delete('track');
  const filters = params.toString();
  const tracks = [...new Set(programmes.filter((p) => !programme || p.id === programme).flatMap((p) => p.tracks))];
  const seg = smsSegments(text);
  const err = state.errors ?? {};

  useEffect(() => {
    let live = true;
    setAudience(null);
    const t = setTimeout(() => { countAudience(slug, filters).then((a) => { if (live) setAudience(a); }).catch(() => {}); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [slug, filters]);

  const insert = (ref: React.RefObject<HTMLTextAreaElement | null>, value: string, set: (v: string) => void, token: string) => {
    const el = ref.current;
    const at = el?.selectionStart ?? value.length;
    set(value.slice(0, at) + token + value.slice(el?.selectionEnd ?? at));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + token.length, at + token.length); });
  };
  const Chips = ({ onPick }: { onPick: (t: string) => void }) => (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(PLACEHOLDERS).map(([token, label]) => (
        <button key={token} type="button" onClick={() => onPick(token)} className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold text-muted hover:border-blue/50 hover:text-blue" title={`Insert ${label.toLowerCase()}`}>{label}</button>
      ))}
    </div>
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="audience" value={filters} />
      {state.message && <Alert tone={state.ok ? 'teal' : 'danger'} title={state.message} />}

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Who receives it</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Select value={programme} onChange={(e) => { setProgramme(e.target.value); setTrack(''); }} aria-label="Programme"><option value="">All programmes</option>{programmes.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Every status</option>{APPLICATION_STATUSES.filter((s) => s !== 'withdrawn').map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</Select>
          <Select value={track} onChange={(e) => setTrack(e.target.value)} aria-label="Track" disabled={!tracks.length}><option value="">All tracks</option>{tracks.map((t) => <option key={t}>{t}</option>)}</Select>
        </div>
        {initial.extra && <p className="mt-2 text-xs text-muted">Also using the extra filters from the applications list.</p>}
        <p className="mt-3 text-[15px]" aria-live="polite">
          {audience === null ? <span className="text-muted">Counting…</span> : <>
            <b>{audience.total.toLocaleString()}</b> {audience.total === 1 ? 'person' : 'people'}
            {sms && <span className="text-muted"> · {audience.withPhone.toLocaleString()} with a valid phone number{audience.onWhatsApp ? `, ${audience.onWhatsApp.toLocaleString()} on WhatsApp` : ''}</span>}
          </>}
        </p>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold">How</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {[{ key: 'email', label: 'Email', on: email, set: setEmail, hint: 'The full message, any length' }, { key: 'sms', label: 'Text message', on: sms, set: setSms, hint: smsReady ? 'WhatsApp for people who chose it, SMS for the rest' : 'Not set up yet' }].map((c) => (
            <label key={c.key} className={cx('flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-4 py-3 transition', c.on ? 'border-blue bg-blue-50' : 'border-line bg-white', c.key === 'sms' && !smsReady && 'cursor-not-allowed opacity-60')}>
              <input type="checkbox" name={`channel.${c.key}`} checked={c.on} disabled={c.key === 'sms' && !smsReady} onChange={(e) => c.set(e.target.checked)} className="size-4 accent-blue" />
              <span><span className="block font-semibold">{c.label}</span><span className="text-xs text-muted">{c.hint}</span></span>
            </label>
          ))}
        </div>
        {err.channels && <p className="mt-2 text-[13px] font-medium text-danger">{err.channels}</p>}
      </Card>

      {email && (
        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Email</h2>
          <Field label="Subject" htmlFor="subject" error={err.subject}><Input id="subject" name="subject" maxLength={160} placeholder="Interview schedule for shortlisted applicants" /></Field>
          <Field label="Message" htmlFor="body" error={err.body} hint="Leave a blank line between paragraphs. Replies go to your hub's contact email.">
            <Textarea ref={bodyRef} id="body" name="body" rows={8} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={'Dear {first_name},\n\nCongratulations on being shortlisted for {programme}…'} />
          </Field>
          <Chips onPick={(t) => insert(bodyRef, body, setBody, t)} />
        </Card>
      )}

      {sms && (
        <Card className="space-y-3 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Text message</h2>
          <Field label="Text message" htmlFor="sms" error={err.sms} hint="Goes by WhatsApp to people who chose it and by SMS to everyone else. SMS length applies to both.">
            <Textarea ref={smsRef} id="sms" name="sms" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="{hub}: Hi {first_name}, your interview is on Tue 10am at the hub. Ref {reference}." />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Chips onPick={(t) => insert(smsRef, text, setText, t)} />
            <span className={cx('text-xs font-semibold', seg.segments > MAX_SMS_SEGMENTS ? 'text-danger' : 'text-muted')}>
              {seg.chars} characters · {seg.segments} SMS{seg.unicode ? ' (special characters use more)' : ''} · names make it longer
            </span>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Sending…" disabled={!audience?.total || (!email && !sms)}>
          {audience?.total ? `Send to ${audience.total.toLocaleString()} ${audience.total === 1 ? 'person' : 'people'}` : 'Send'}
        </SubmitButton>
        <span className="text-sm text-muted">Withdrawn applicants are never messaged.</span>
      </div>
    </form>
  );
}
