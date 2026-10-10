'use client';
import { useActionState, useState, useTransition } from 'react';
import { CANDIDATE_STAGES, EMPLOYER_STAGES, JOB_TYPES, NIGERIAN_STATES, WORK_MODES, invoiceTotals, naira } from '@talentral/domain';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { keepValues } from '@/lib/keep-values';
import { SkillListInput } from '@/components/skill-list-input';
import {
  confirmPlacementOfficer, recordRetentionOfficer,
  addCandidateForm, addToRoleForm, createRole, createShortlistLink, issueInvoice, reviewEmployer, saveEmployer, sendShortlist, setInvoiceStatus, updateCandidate, type TalentState,
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

export function RoleForm({ employerId, skills = [] }: { employerId: string; skills?: { name: string; track: string }[] }) {
  const [state, action] = useActionState<TalentState, FormData>(createRole.bind(null, employerId), {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {state.message && <div className="sm:col-span-2"><Alert tone="danger">{state.message}</Alert></div>}
      <div className="sm:col-span-2"><Field label="Role title" htmlFor="ro-title" required error={e.title}><Input id="ro-title" name="title" maxLength={160} placeholder="Social media executive" /></Field></div>
      <div className="sm:col-span-2">
        <Field label="Required skills" htmlFor="ro-skills" required error={e.skills} hint="Separate with commas. Matching compares these with Passport skills and certificate tracks.">
          <SkillListInput id="ro-skills" name="skills" suggestions={skills} invalid={Boolean(e.skills)} />
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

// The verification decision, with the reason the employer sees when sent back or paused.
export function EmployerReview({ id, status }: { id: string; status: 'pending' | 'verified' | 'rejected' | 'suspended' }) {
  const [verifyState, verify] = useActionState<TalentState, FormData>(reviewEmployer.bind(null, id, 'verified'), {});
  const [rejectState, reject] = useActionState<TalentState, FormData>(reviewEmployer.bind(null, id, 'rejected'), {});
  const [pauseState, pause] = useActionState<TalentState, FormData>(reviewEmployer.bind(null, id, 'suspended'), {});
  const [mode, setMode] = useState<'none' | 'reject' | 'pause'>('none');
  const done = [verifyState, rejectState, pauseState].find((s) => s.ok);
  if (done) return <Alert tone="teal">{done.message}</Alert>;
  const reasonForm = (kind: 'reject' | 'pause') => {
    const [state, action] = kind === 'reject' ? [rejectState, reject] : [pauseState, pause];
    return (
      <form action={action} className="mt-3 space-y-2">
        <Field label={kind === 'reject' ? 'What should the employer fix?' : 'Why is the account paused?'} htmlFor={`rv-${kind}`} required error={state.errors?.note}
          hint={kind === 'reject' ? 'They see this and can update their details, then ask again.' : 'They see this in their account and by email.'}>
          <Textarea id={`rv-${kind}`} name="note" rows={3} maxLength={1000} placeholder={kind === 'reject' ? 'We could not find this CAC number on the public register. Please check it and add your company website.' : ''} />
        </Field>
        <div className="flex gap-2">
          <SubmitButton size="sm" variant="danger" pendingLabel="Saving…">{kind === 'reject' ? 'Send back to the employer' : 'Pause account'}</SubmitButton>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode('none')}>Cancel</Button>
        </div>
        {state.message && <p className="text-sm text-danger">{state.message}</p>}
      </form>
    );
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {status !== 'verified' && <form action={verify}><SubmitButton size="sm" pendingLabel="Verifying…">Verify employer</SubmitButton></form>}
        {status !== 'rejected' && status !== 'verified' && <Button type="button" size="sm" variant="secondary" onClick={() => setMode('reject')}>Needs changes</Button>}
        {status !== 'suspended' && <Button type="button" size="sm" variant="ghost" className="text-danger" onClick={() => setMode('pause')}>Pause</Button>}
      </div>
      {verifyState.message && !verifyState.ok && <p className="mt-2 text-sm text-danger">{verifyState.message}</p>}
      {mode !== 'none' && reasonForm(mode)}
    </div>
  );
}

// Confirms a hire on the employer's behalf; the note says how the employer confirmed it.
export function OfficerConfirmForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<TalentState, FormData>(confirmPlacementOfficer.bind(null, id), {});
  if (state.ok) return <p role="status" className="text-sm font-semibold text-teal-700">{state.message}</p>;
  return (
    <form onSubmit={keepValues(action)} className="flex flex-col gap-2 sm:flex-row sm:items-start" aria-label={`Confirm the hire of ${name}`}>
      <div className="min-w-0 flex-1">
        <Input name="note" aria-label={`How the employer confirmed hiring ${name}`} placeholder="How the employer confirmed it, e.g. HR confirmed by phone on 3 Oct" maxLength={500}
          aria-invalid={Boolean(state.errors?.note)} />
        {state.errors?.note && <p className="mt-1 text-sm text-danger">{state.errors.note}</p>}
      </div>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>Confirm on their behalf</Button>
      {state.message && !state.ok && <p className="text-sm text-danger">{state.message}</p>}
    </form>
  );
}

// Records the 90-day answer when the employer has not given it.
export function OfficerRetentionForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<TalentState, FormData>(recordRetentionOfficer.bind(null, id), {});
  if (state.ok) return <p role="status" className="text-sm font-semibold text-teal-700">{state.message}</p>;
  return (
    <form onSubmit={keepValues(action)} className="space-y-2" aria-label={`Record the 90-day check for ${name}`}>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="sr-only">Is {name} still in the job?</legend>
        <label className="flex items-center gap-2"><input type="radio" name="retained" value="yes" className="size-4 accent-blue" /> Still in the job</label>
        <label className="flex items-center gap-2"><input type="radio" name="retained" value="no" className="size-4 accent-blue" /> Left</label>
      </fieldset>
      {state.errors?.retained && <p className="text-sm text-danger">{state.errors.retained}</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <Input name="note" aria-label={`How you checked on ${name}`} placeholder="How you checked, e.g. called the learner on 5 Oct" maxLength={500} aria-invalid={Boolean(state.errors?.note)} />
          {state.errors?.note && <p className="mt-1 text-sm text-danger">{state.errors.note}</p>}
        </div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>Record the check</Button>
      </div>
      {state.message && !state.ok && <p className="text-sm text-danger">{state.message}</p>}
    </form>
  );
}

// Sends the shortlist to the employer once at least one person has said yes and shares their Passport.
export function SendShortlistButton({ roleId, ready }: { roleId: string; ready: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TalentState | null>(null);
  return (
    <div className="space-y-2">
      <Button className="w-full" disabled={pending || ready === 0} aria-busy={pending} onClick={() => start(async () => setResult(await sendShortlist(roleId)))}>
        {pending ? 'Sending…' : ready ? `Send shortlist (${ready})` : 'Send shortlist'}
      </Button>
      {ready === 0 && !result && <p className="text-xs text-muted">Available once someone says yes and shares their Passport with employers.</p>}
      {result?.message && <Alert tone={result.ok ? 'teal' : 'amber'}>{result.message}</Alert>}
    </div>
  );
}

// Fee terms for a confirmed hire, with the totals worked out as you type.
export function IssueInvoiceForm({ candidateId, suggestedAnnual }: { candidateId: string; suggestedAnnual: number | null }) {
  const [state, action, pending] = useActionState<TalentState, FormData>(issueInvoice.bind(null, candidateId), {});
  const [type, setType] = useState<'percent' | 'flat'>('percent');
  const [pct, setPct] = useState('10');
  const [annual, setAnnual] = useState(suggestedAnnual ? String(suggestedAnnual) : '');
  const [flat, setFlat] = useState('');
  const [vat, setVat] = useState('0');
  const num = (v: string) => Number(v.replace(/[,\s₦]/g, '')) || 0;
  const totals = invoiceTotals({ fee_type: type, fee_percent: num(pct), annual_pay: num(annual), flat: num(flat), vat_percent: num(vat) });
  const id = (k: string) => `inv-${candidateId.slice(0, 8)}-${k}`;
  return (
    <form action={action} className="space-y-3">
      {state.message && <Alert tone="danger">{state.message}</Alert>}
      <fieldset className="flex flex-wrap gap-2 text-sm">
        <legend className="sr-only">Fee type</legend>
        {(['percent', 'flat'] as const).map((t) => (
          <label key={t} className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue/40 ${type === t ? 'border-blue bg-blue-50 font-semibold text-blue' : 'border-line text-muted'}`}>
            <input type="radio" name="fee_type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
            {t === 'percent' ? 'Percentage of first-year pay' : 'Flat fee'}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-4">
        {type === 'percent' ? (
          <>
            <Field label="Fee %" htmlFor={id('pct')}><Input id={id('pct')} name="fee_percent" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="First-year pay (₦)" htmlFor={id('annual')} hint={suggestedAnnual ? 'From the job’s pay range; adjust to the offer.' : undefined}>
              <Input id={id('annual')} name="annual_pay" inputMode="numeric" value={annual} onChange={(e) => setAnnual(e.target.value)} placeholder="3,000,000" />
            </Field></div>
          </>
        ) : (
          <div className="sm:col-span-3"><Field label="Fee (₦)" htmlFor={id('flat')}><Input id={id('flat')} name="flat" inputMode="numeric" value={flat} onChange={(e) => setFlat(e.target.value)} placeholder="150,000" /></Field></div>
        )}
        <Field label="VAT %" htmlFor={id('vat')} hint="0 unless VAT-registered"><Input id={id('vat')} name="vat_percent" inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} /></Field>
      </div>
      <input type="hidden" name="due_days" value="14" />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-canvas px-4 py-3 text-sm">
        <span className="text-muted">{totals ? <>Fee {naira(totals.subtotal)}{totals.vat ? <> · VAT {naira(totals.vat)}</> : null} · due in 14 days</> : 'Enter the fee terms'}</span>
        <span className="font-display text-lg font-semibold tabular-nums">{totals ? naira(totals.total) : '₦0'}</span>
      </div>
      <Button type="submit" disabled={pending || !totals} aria-busy={pending}>{pending ? 'Issuing…' : 'Issue invoice'}</Button>
    </form>
  );
}

// Payment, waiver or voiding, with the reference or reason kept on the invoice.
export function InvoiceStatusForm({ invoiceId, status }: { invoiceId: string; status: 'issued' | 'paid' | 'waived' | 'void' }) {
  const [paidState, markPaid, paying] = useActionState<TalentState, FormData>(setInvoiceStatus.bind(null, invoiceId, 'paid'), {});
  const [waiveState, waive, waiving] = useActionState<TalentState, FormData>(setInvoiceStatus.bind(null, invoiceId, 'waived'), {});
  const [voidState, voidIt, voiding] = useActionState<TalentState, FormData>(setInvoiceStatus.bind(null, invoiceId, 'void'), {});
  const [reopenState, reopen, reopening] = useActionState<TalentState, FormData>(setInvoiceStatus.bind(null, invoiceId, 'issued'), {});
  const msg = [paidState, waiveState, voidState, reopenState].find((s) => s.message);
  if (status !== 'issued') {
    return (
      <form action={reopen} className="space-y-2">
        {msg?.message && <Alert tone={msg.ok ? 'teal' : 'danger'}>{msg.message}</Alert>}
        <Button variant="secondary" disabled={reopening}>{reopening ? 'Reopening…' : 'Reopen as unpaid'}</Button>
      </form>
    );
  }
  return (
    <div className="space-y-4">
      {msg?.message && <Alert tone={msg.ok ? 'teal' : 'danger'}>{msg.message}</Alert>}
      <form action={markPaid} className="space-y-2">
        <Field label="Payment reference" htmlFor={`ref-${invoiceId}`} hint="Bank transfer reference or receipt number"><Input id={`ref-${invoiceId}`} name="reference" maxLength={120} /></Field>
        <Button disabled={paying}>{paying ? 'Saving…' : 'Record payment'}</Button>
      </form>
      <form className="space-y-2 border-t border-line pt-4">
        <Field label="Reason to waive or void" htmlFor={`note-${invoiceId}`}><Textarea id={`note-${invoiceId}`} name="note" rows={2} maxLength={500} /></Field>
        <div className="flex flex-wrap gap-2">
          <Button formAction={waive} variant="secondary" disabled={waiving}>{waiving ? 'Saving…' : 'Waive'}</Button>
          <Button formAction={voidIt} variant="danger" disabled={voiding}>{voiding ? 'Saving…' : 'Void'}</Button>
        </div>
      </form>
    </div>
  );
}
