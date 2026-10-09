'use client';
import { useActionState, useEffect, useState } from 'react';
import { NIGERIAN_STATES, buttonColor, contrastRatio, isHexColor } from '@talentral/domain';
import type { Tenant } from '@talentral/db';
import { Alert, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { saveProfile, type ProfileState } from './actions';
import { FileDrop } from '@/components/file-drop';

export function ProfileForm({ hub, logo }: { hub: Tenant; logo: string | null }) {
  const [state, action] = useActionState<ProfileState, FormData>(saveProfile.bind(null, hub.slug), {});
  const [color, setColor] = useState(hub.brand_color ?? '#2E5BFF');
  const [preview, setPreview] = useState<string | null>(logo);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (state.ok) setDirty(false); }, [state]);
  const e = state.errors ?? {};
  const s = hub.socials ?? {};
  const valid = isHexColor(color);
  const readable = valid && contrastRatio(color.toUpperCase(), '#FFFFFF') >= 4.5;

  return (
    <form action={action} onChange={() => setDirty(true)} className="space-y-6">
      {state.message && <Alert tone={state.ok ? 'teal' : 'danger'} title={state.message} />}

      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Identity</h2>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-canvas">
            {preview ? <img src={preview} alt="Logo preview" className="size-full object-contain p-2" /> : <span className="px-2 text-center text-xs text-muted">No logo yet</span>}
          </div>
          <div className="flex-1">
            <Field label="Logo" htmlFor="logo" required hint="Square or wide, PNG, JPEG or WebP, up to 2 MB. A transparent PNG looks best." error={e.logo}>
              <FileDrop id="logo" name="logo" accept="image/png,image/jpeg,image/webp" types="PNG, JPEG or WebP, up to 2 MB" compact aria-invalid={e.logo ? true : undefined}
                onChange={(ev) => { const f = ev.target.files?.[0]; if (f) setPreview(URL.createObjectURL(f)); }} />
            </Field>
          </div>
        </div>
        <Field label="Hub name" htmlFor="name" required error={e.name}><Input id="name" name="name" defaultValue={hub.name} /></Field>
        <Field label="Tagline" htmlFor="tagline" required hint="One line that says what you do." error={e.tagline}>
          <Input id="tagline" name="tagline" maxLength={160} defaultValue={hub.tagline ?? ''} placeholder="Building the next generation of tech talent in Katsina" />
        </Field>
        <Field label="About your hub" htmlFor="description" required hint="Shown on your public page. What you do, who you serve, what you have achieved." error={e.description}>
          <Textarea id="description" name="description" rows={6} maxLength={2000} defaultValue={hub.description ?? ''} />
        </Field>
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Brand colour</h2>
        <p className="-mt-3 text-sm text-muted">Used for buttons and highlights on your hub pages. It must be dark enough for white text to be readable.</p>
        <div className="flex flex-wrap items-center gap-3">
          <input type="color" value={valid ? color : '#2E5BFF'} onChange={(ev) => setColor(ev.target.value.toUpperCase())} className="h-11 w-14 cursor-pointer rounded-lg border border-line bg-white p-1" aria-label="Pick a colour" />
          <Input name="brand_color" value={color} onChange={(ev) => setColor(ev.target.value)} className="w-36 font-mono uppercase" aria-label="Colour code" />
          <span className="flex items-center gap-2 rounded-[var(--radius-control)] border border-dashed border-line-strong px-3 py-1.5" aria-label={`Preview of a button in ${color}`}>
            <span className="text-xs font-medium text-muted">Preview</span>
            <span aria-hidden className="pointer-events-none inline-flex h-8 select-none items-center rounded-md px-3 text-[13px] font-medium text-white" style={{ background: buttonColor(color) }}>Apply now</span>
            <span aria-hidden className="text-[13px] font-semibold underline underline-offset-2" style={{ color: buttonColor(color) }}>A link</span>
          </span>
        </div>
        {e.brand_color ? <p className="text-[13px] font-medium text-danger">{e.brand_color}</p>
          : valid && !readable && <Alert tone="amber">This colour is too light for white text, so buttons will use Talentral Blue instead. Try a darker shade.</Alert>}
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Contact and location</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Contact email" htmlFor="contact_email" required hint="Shown to applicants." error={e.contact_email}><Input id="contact_email" name="contact_email" type="email" defaultValue={hub.contact_email ?? ''} /></Field>
          <Field label="Contact phone" htmlFor="contact_phone" error={e.contact_phone}><Input id="contact_phone" name="contact_phone" type="tel" defaultValue={hub.contact_phone ?? ''} /></Field>
          <Field label="State" htmlFor="state" error={e.state}>
            <Select id="state" name="state" defaultValue={hub.state ?? ''}><option value="">Choose a state</option>{NIGERIAN_STATES.map((st) => <option key={st}>{st}</option>)}</Select>
          </Field>
          <Field label="Website" htmlFor="website" error={e.website}><Input id="website" name="website" type="url" placeholder="https://" defaultValue={hub.website ?? ''} /></Field>
        </div>
        <Field label="Address" htmlFor="address" error={e.address}><Input id="address" name="address" defaultValue={hub.address ?? ''} /></Field>
      </Card>

      <Card className="space-y-5 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Social links</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {(['linkedin', 'x', 'instagram', 'facebook'] as const).map((k) => (
            <Field key={k} label={k === 'x' ? 'X (Twitter)' : k[0]!.toUpperCase() + k.slice(1)} htmlFor={k} error={e[k]}>
              <Input id={k} name={k} type="url" placeholder="https://" defaultValue={s[k] ?? ''} />
            </Field>
          ))}
        </div>
      </Card>

      <div className="sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t border-line bg-white/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(16,24,40,0.12)] backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <p className="text-sm text-muted" aria-live="polite">{dirty ? <><span className="mr-2 inline-block size-2 rounded-full bg-amber-800/70 align-middle" aria-hidden />Unsaved changes</> : 'Every change on this page saves together.'}</p>
        <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
      </div>
    </form>
  );
}
