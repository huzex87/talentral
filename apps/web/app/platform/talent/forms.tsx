'use client';
import { useActionState, useState, useTransition } from 'react';
import { CANDIDATE_STAGES, EMPLOYER_STAGES, JOB_TYPES, NIGERIAN_STATES, WORK_MODES } from '@talentral/domain';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { keepValues } from '@/lib/keep-values';
import {
  addCandidateForm, addToRoleForm, createRole, createShortlistLink, saveEmployer, updateCandidate, type TalentState,
} from './actions';

export interface EmployerValues { name: string; sector: string | null; website: string | null; state: string | null; contact_name: string | null;
  contact_email: string | null; contact_phone: string | null; stage: string; notes: string | null }

export function EmployerForm({ id, initial }: { id: string | null; initial?: EmployerValues }) {
  const [state, action, pending] = useActionState<TalentState, FormData>(saveEmployer.bind(null, id), {});
  const e = state.errors ?? {};
  const v = initial;
  return (
    <form onSubmit={keepValues(action)} className="grid gap-4 sm:grid-cols-2">
      {state.message && <div className="sm:col-span-2"><Alert tone={state.ok ? 'teal' : 'danger'}>{state.message}</Alert></div>}
      <Field label="Employer name" htmlFor="em-name" required error={e.name}><Input id="em-name" name="name" defaultValue={v?.name ?? ''} maxLength={160} /></Field>
      <Field label="Sector" htmlFor="em-sector" error={e.sector}><Input id="em-sector" name="sector" defaultValue={v?.sector ?? ''} placeholder="Digital marketing agency" maxLength={80} /></Field>
      <Field label="Website" htmlFor="em-web" error={e.website}><Input id="em-web" name="website" type="url" defaultValue={v?.website ?? ''} placeholder="https://" /></Field>
      <Field label="State" htmlFor="em-state" error={e.state}>
        <Select id="em-state" name="state" defaultValue={v?.state ?? ''}><option value="">Not set</option>{NIGERIAN_STATES.map((s) => <option key={s}>{s}</option>)}</Select>
      </Field>
      <Field label="Contact person" htmlFor="em-cn" error={e.contact_name}><Input id="em-cn" name="contact_name" defaultValue={v?.contact_name ?? ''} maxLength={120} /></Field>
      <Field label="Contact email" htmlFor="em-ce" error={e.contact_email}><Input id="em-ce" name="contact_email" type="email" defaultValue={v?.contact_email ?? ''} /></Field>
      <Field label="Contact phone" htmlFor="em-cp" error={e.contact_phone}><Input id="em-cp" name="contact_phone" type="tel" defaultValue={v?.contact_phone ?? ''} /></Field>
      <Field label="Stage" htmlFor="em-stage" error={e.stage}>
        <Select id="em-stage" name="stage" defaultValue={v?.stage ?? 'lead'}>{Object.entries(EMPLOYER_STAGES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      </Field>
      <div className="sm:col-span-2"><Field label="Notes" htmlFor="em-notes" error={e.notes}><Textarea id="em-notes" name="notes" rows={3} defaultValue={v?.notes ?? ''} maxLength={4000} /></Field></div>
      <div className="sm:col-span-2"><Button type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Saving…' : id ? 'Save employer' : 'Add employer'}</Button></div>
    </form>
  );
}

export function RoleForm({ employerId }: { employerId: string }) {
  const [state, action] = useActionState<TalentState, FormData>(createRole.bind(null, employerId), {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {state.message && <div className="sm:col-span-2"><Alert tone="danger">{state.message}</Alert></div>}
      <div className="sm:col-span-2"><Field label="Role title" htmlFor="ro-title" required error={e.title}><Input id="ro-title" name="title" maxLength={160} placeholder="Social media executive" /></Field></div>
      <div className="sm:col-span-2">
        <Field label="Required skills" htmlFor="ro-skills" required error={e.skills} hint="Separate with commas. Matching compares these with Passport skills and certificate tracks.">
          <Input id="ro-skills" name="skills" placeholder="Social media management, Canva, Copywriting" />
        </Field>
      </div>
      <Field label="Work mode" htmlFor="ro-mode" error={e.work_mode}>
        <Select id="ro-mode" name="work_mode" defaultValue="remote">{Object.entries(WORK_MODES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      </Field>
      <Field label="Type" htmlFor="ro-type" error={e.job_type}>
        <Select id="ro-type" name="job_type" defaultValue="full_time">{Object.entries(JOB_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      </Field>
      <Field label="Location (state)" htmlFor="ro-state" error={e.state} hint="For hybrid and on-site roles.">
        <Select id="ro-state" name="state" defaultValue=""><option value="">Anywhere</option>{NIGERIAN_STATES.map((s) => <option key={s}>{s}</option>)}</Select>
      </Field>
      <Field label="Openings" htmlFor="ro-open" error={e.openings}><Input id="ro-open" name="openings" type="number" min={1} max={500} defaultValue={1} inputMode="numeric" /></Field>
      <Field label="Pay from (₦ a month)" htmlFor="ro-min" error={e.pay_min}><Input id="ro-min" name="pay_min" inputMode="numeric" placeholder="150000" /></Field>
      <Field label="Pay up to (₦ a month)" htmlFor="ro-max" error={e.pay_max}><Input id="ro-max" name="pay_max" inputMode="numeric" placeholder="250000" /></Field>
      <div className="sm:col-span-2"><Field label="Description" htmlFor="ro-desc" error={e.description}><Textarea id="ro-desc" name="description" rows={4} maxLength={4000} placeholder="What the person will do, hours, and anything candidates should know." /></Field></div>
      <div className="sm:col-span-2"><SubmitButton pendingLabel="Adding…">Add role</SubmitButton></div>
    </form>
  );
}

export function AddToRoleForm({ userId, roles }: { userId: string; roles: { id: string; label: string }[] }) {
  const [state, action] = useActionState<TalentState, FormData>(addToRoleForm.bind(null, userId), {});
  if (!roles.length) return <p className="text-sm text-muted">No open roles yet. Add one under Employers and roles.</p>;
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select name="role_id" aria-label="Role" defaultValue="" className="flex-1"><option value="" disabled>Choose an open role</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select>
        <SubmitButton pendingLabel="Adding…">Put forward</SubmitButton>
      </div>
      {state.message && <Alert tone={state.ok ? 'teal' : 'amber'}>{state.message}</Alert>}
    </form>
  );
}

export function AddCandidateButton({ roleId, userId, name }: { roleId: string; userId: string; name: string }) {
  const [state, action] = useActionState<TalentState, FormData>(addCandidateForm.bind(null, roleId, userId), {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <SubmitButton pendingLabel="Adding…" aria-label={`Put forward ${name}`}>Put forward</SubmitButton>
      {state.message && <span className={`text-xs ${state.ok ? 'text-teal-700' : 'text-amber-800'}`}>{state.message}</span>}
    </form>
  );
}

export interface CandidateValues { id: string; name: string; stage: string; notes: string | null; placement_type: string | null; start_date: string | null; pay_band: string | null }

export function CandidateForm({ c }: { c: CandidateValues }) {
  const [state, action, pending] = useActionState<TalentState, FormData>(updateCandidate.bind(null, c.id), {});
  const [stage, setStage] = useState(c.stage);
  const e = state.errors ?? {};
  return (
    <form onSubmit={keepValues(action)} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
        <Field label="Stage" htmlFor={`st-${c.id}`}>
          <Select id={`st-${c.id}`} name="stage" value={stage} onChange={(ev) => setStage(ev.target.value)} aria-label={`Stage for ${c.name}`}>
            {Object.entries(CANDIDATE_STAGES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Notes" htmlFor={`nt-${c.id}`}><Input id={`nt-${c.id}`} name="notes" defaultValue={c.notes ?? ''} maxLength={2000} placeholder="Interview on Tuesday, strong portfolio" /></Field>
      </div>
      {stage === 'placed' ? (
        <div className="grid gap-3 rounded-xl border border-teal-700/20 bg-teal-50/60 p-3 sm:grid-cols-3">
          <Field label="Type of work" htmlFor={`pt-${c.id}`} error={e.placement_type}>
            <Select id={`pt-${c.id}`} name="placement_type" defaultValue={c.placement_type ?? ''}><option value="">Choose</option>{Object.entries(JOB_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
          <Field label="Start date" htmlFor={`sd-${c.id}`} error={e.start_date}><Input id={`sd-${c.id}`} name="start_date" type="date" defaultValue={c.start_date ?? ''} /></Field>
          <Field label="Pay band" htmlFor={`pb-${c.id}`} error={e.pay_band}><Input id={`pb-${c.id}`} name="pay_band" defaultValue={c.pay_band ?? ''} placeholder="₦150k to ₦200k" maxLength={60} /></Field>
        </div>
      ) : (
        <><input type="hidden" name="placement_type" value="" /><input type="hidden" name="start_date" value="" /><input type="hidden" name="pay_band" value="" /></>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>{pending ? 'Saving…' : 'Save'}</Button>
        {state.message && <span className={`text-sm ${state.ok ? 'text-teal-700' : 'text-danger'}`}>{state.message}</span>}
      </div>
    </form>
  );
}

export function ShareLinkButton({ roleId, disabled }: { roleId: string; disabled: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TalentState | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <Button disabled={pending || disabled} onClick={() => start(async () => { setCopied(false); setResult(await createShortlistLink(roleId)); })}>
        {pending ? 'Creating…' : 'Create employer link'}
      </Button>
      {result?.url && (
        <div className="rounded-xl border border-teal-700/20 bg-teal-50 p-3">
          <p className="text-sm text-teal-700">{result.message}</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input readOnly value={result.url} aria-label="Employer link" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2 font-mono text-xs" />
            <Button type="button" variant="secondary" size="sm" onClick={async () => { await navigator.clipboard.writeText(result.url!); setCopied(true); }}>{copied ? 'Copied' : 'Copy link'}</Button>
          </div>
        </div>
      )}
      {result && !result.url && result.message && <Alert tone="amber">{result.message}</Alert>}
    </div>
  );
}
