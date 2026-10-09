'use client';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { MAX_PARTNERS, PARTNER_ROLES, type PartnerRole } from '@talentral/domain';
import { Alert, Badge, Button, Field, Input, Select } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { addPartner, movePartner, removePartner, type PartnerState } from '../partner-actions';
import { FileDrop } from '@/components/file-drop';

export interface PartnerRow { id: string; name: string; role: PartnerRole; logo: string }

export function PartnersManager({ slug, programmeId, partners }: { slug: string; programmeId: string; partners: PartnerRow[] }) {
  const [state, action] = useActionState<PartnerState, FormData>(addPartner.bind(null, slug, programmeId), {});
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<PartnerState | null>(null);
  const [pending, start] = useTransition();
  // Only the latest outcome is shown: an earlier "added" message goes once something else happens.
  const [dismissed, setDismissed] = useState<PartnerState | null>(null);
  const e = state.errors ?? {};
  const full = partners.length >= MAX_PARTNERS;
  useEffect(() => { if (state.ok) setPreview(null); }, [state]);

  return (
    <div className="space-y-5">
      {partners.length > 0 ? (
        <ul className="grid gap-3 lg:grid-cols-2" aria-label="Partners and sponsors">
          {partners.map((p, i) => (
            <li key={p.id} className="rounded-xl border border-line bg-white p-3">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl border border-line bg-canvas p-2">
                  <img src={p.logo} alt={`${p.name} logo`} className="max-h-full max-w-full object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge tone={p.role === 'funder' ? 'violet' : p.role === 'sponsor' ? 'amber' : 'blue'}>{PARTNER_ROLES[p.role]}</Badge>
                    <span className="text-xs text-muted">#{i + 1}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2">
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" disabled={pending || i === 0} aria-label={`Move ${p.name} earlier`}
                    onClick={() => start(async () => { setDismissed(state); setResult(null); await movePartner(slug, programmeId, p.id, -1); })}>↑ Earlier</Button>
                  <Button type="button" variant="ghost" size="sm" disabled={pending || i === partners.length - 1} aria-label={`Move ${p.name} later`}
                    onClick={() => start(async () => { setDismissed(state); setResult(null); await movePartner(slug, programmeId, p.id, 1); })}>↓ Later</Button>
                </div>
                <Button type="button" variant="ghost" size="sm" disabled={pending} className="text-danger"
                  onClick={() => { if (confirm(`Remove ${p.name}? Certificates already issued keep this logo.`)) start(async () => { setDismissed(state); setResult(await removePartner(slug, programmeId, p.id)); }); }}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-line bg-canvas px-4 py-6 text-center text-sm text-muted">
          No partners yet. Add the funders, sponsors and partners behind this programme and their logos appear on its page and on every certificate.
        </p>
      )}
      {result?.message && <Alert tone={result.ok ? 'teal' : 'amber'}>{result.message}</Alert>}

      {full ? (
        <Alert tone="neutral">This programme shows the maximum of {MAX_PARTNERS} partners. Remove one to add another.</Alert>
      ) : (
        <form key={state.ok ? state.message : 'form'} action={action} onSubmit={() => setResult(null)} className="space-y-4 rounded-xl border border-line bg-canvas/60 p-4 sm:p-5">
          <p className="font-semibold">Add a partner</p>
          {state.message && state !== dismissed && <Alert tone={state.ok ? 'teal' : 'danger'}>{state.message}</Alert>}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white p-2">
              {preview ? <img src={preview} alt="Logo preview" className="max-h-full max-w-full object-contain" /> : <span className="text-center text-xs text-muted">Logo preview</span>}
            </div>
            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              <Field label="Organisation name" htmlFor="pt-name" required error={e.name}>
                <Input id="pt-name" name="name" maxLength={120} placeholder="iDICE" />
              </Field>
              <Field label="Role" htmlFor="pt-role" error={e.role}>
                <Select id="pt-role" name="role" defaultValue="partner">
                  {Object.entries(PARTNER_ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Partner logo" htmlFor="pt-logo" required hint="PNG, JPEG or WebP, up to 2 MB. A wide, transparent PNG prints best." error={e.logo}>
                  <FileDrop id="pt-logo" name="logo" accept="image/png,image/jpeg,image/webp" types="PNG, JPEG or WebP, up to 2 MB" compact aria-invalid={e.logo ? true : undefined}
                    onChange={(ev) => { const f = ev.target.files?.[0]; setPreview(f ? URL.createObjectURL(f) : null); }} />
                </Field>
              </div>
            </div>
          </div>
          <SubmitButton pendingLabel="Adding…">Add partner</SubmitButton>
        </form>
      )}
    </div>
  );
}
