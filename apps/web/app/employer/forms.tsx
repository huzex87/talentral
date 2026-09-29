'use client';
import { useActionState, useState } from 'react';
import { CANDIDATE_STAGES, JOB_TYPES, NIGERIAN_STATES, WORK_MODES } from '@talentral/domain';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { SkillListInput } from '@/components/skill-list-input';
import { SubmitButton } from '@/components/submit-button';
import { keepValues } from '@/lib/keep-values';
import type { EmployerAccount } from '@/lib/employer';
import { inviteCandidate, postJob, saveEmployerProfile, updateApplicant, type EmployerState } from './actions';

export function JobForm({ skills }: { skills: { name: string; track: string }[] }) {
  const [state, action] = useActionState<EmployerState, FormData>(postJob, {});
  const e = state.errors ?? {};
  return (
    <form onSubmit={keepValues(action)} className="grid gap-4 sm:grid-cols-2">
      {state.message && <div className="sm:col-span-2"><Alert tone="danger">{state.message}</Alert></div>}
      <div className="sm:col-span-2"><Field label="Job title" htmlFor="jb-title" required error={e.title}><Input id="jb-title" name="title" maxLength={160} placeholder="Junior frontend developer" /></Field></div>
      <div className="sm:col-span-2">
        <Field label="Required skills" htmlFor="jb-skills" required error={e.skills} hint="Separate with commas, or pick from the skills list. Matches are ranked on these.">
          <SkillListInput id="jb-skills" name="skills" suggestions={skills} invalid={Boolean(e.skills)} />
        </Field>
      </div>
      <Field label="Work mode" htmlFor="jb-mode" error={e.work_mode}>
        <Select id="jb-mode" name="work_mode" defaultValue="remote">{Object.entries(WORK_MODES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      </Field>
      <Field label="Type" htmlFor="jb-type" error={e.job_type}>
        <Select id="jb-type" name="job_type" defaultValue="full_time">{Object.entries(JOB_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      </Field>
      <Field label="Based in (state)" htmlFor="jb-state" error={e.state} hint="Needed for hybrid and on-site jobs.">
        <Select id="jb-state" name="state" defaultValue=""><option value="">Anywhere (remote)</option>{NIGERIAN_STATES.map((s) => <option key={s}>{s}</option>)}</Select>
      </Field>
      <Field label="Openings" htmlFor="jb-open" error={e.openings}><Input id="jb-open" name="openings" type="number" min={1} max={500} defaultValue={1} inputMode="numeric" /></Field>
      <Field label="Pay from (₦ a month)" htmlFor="jb-min" required error={e.pay_min}><Input id="jb-min" name="pay_min" inputMode="numeric" placeholder="150000" /></Field>
      <Field label="Pay up to (₦ a month)" htmlFor="jb-max" required error={e.pay_max}><Input id="jb-max" name="pay_max" inputMode="numeric" placeholder="250000" /></Field>
      <div className="sm:col-span-2">
        <Field label="Job description" htmlFor="jb-desc" required error={e.description}>
          <Textarea id="jb-desc" name="description" rows={5} maxLength={4000} placeholder="What the person will do, who they will work with, hours, and how you will support them." />
        </Field>
      </div>
      <div className="sm:col-span-2"><SubmitButton pendingLabel="Posting…">Post job and see matches</SubmitButton></div>
    </form>
  );
}

export function InviteButton({ jobId, userId, name }: { jobId: string; userId: string; name: string }) {
  const [state, action] = useActionState<EmployerState, FormData>(inviteCandidate.bind(null, jobId, userId), {});
  if (state.ok) return <span className="rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700">✓ {state.message}</span>;
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <SubmitButton pendingLabel="Inviting…" aria-label={`Invite ${name}`}>Invite to apply</SubmitButton>
      {state.message && <span className="text-xs text-amber-800">{state.message}</span>}
    </form>
  );
}

export interface ApplicantValues { id: string; name: string; stage: string; notes: string | null; placement_type: string | null; start_date: string | null; pay_band: string | null }

export function ApplicantForm({ c }: { c: ApplicantValues }) {
  const [state, action, pending] = useActionState<EmployerState, FormData>(updateApplicant.bind(null, c.id), {});
  const [stage, setStage] = useState(c.stage);
  const e = state.errors ?? {};
  return (
    <form onSubmit={keepValues(action)} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
        <Field label="Stage" htmlFor={`ap-${c.id}`}>
          <Select id={`ap-${c.id}`} name="stage" value={stage} onChange={(ev) => setStage(ev.target.value)} aria-label={`Stage for ${c.name}`}>
            {Object.entries(CANDIDATE_STAGES).map(([k, l]) => <option key={k} value={k}>{k === 'placed' ? 'Hired' : l}</option>)}
          </Select>
        </Field>
        <Field label="Private notes" htmlFor={`an-${c.id}`}><Input id={`an-${c.id}`} name="notes" defaultValue={c.notes ?? ''} maxLength={2000} placeholder="Interview on Thursday at 10:00" /></Field>
      </div>
      {stage === 'placed' ? (
        <div className="grid gap-3 rounded-xl border border-teal-700/20 bg-teal-50/60 p-3 sm:grid-cols-3">
          <Field label="Type of work" htmlFor={`at-${c.id}`} error={e.placement_type}>
            <Select id={`at-${c.id}`} name="placement_type" defaultValue={c.placement_type ?? ''}><option value="">Choose</option>{Object.entries(JOB_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
          <Field label="Start date" htmlFor={`as-${c.id}`} error={e.start_date}><Input id={`as-${c.id}`} name="start_date" type="date" defaultValue={c.start_date ?? ''} /></Field>
          <Field label="Pay band" htmlFor={`ab-${c.id}`} error={e.pay_band}><Input id={`ab-${c.id}`} name="pay_band" defaultValue={c.pay_band ?? ''} placeholder="₦200k a month" maxLength={60} /></Field>
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

export function EmployerProfileForm({ employer }: { employer: EmployerAccount }) {
  const [state, action, pending] = useActionState<EmployerState, FormData>(saveEmployerProfile, {});
  const e = state.errors ?? {};
  return (
    <form onSubmit={keepValues(action)} className="grid gap-4">
      <Field label="Sector" htmlFor="ep-sector" error={e.sector}><Input id="ep-sector" name="sector" defaultValue={employer.sector ?? ''} /></Field>
      <Field label="Website" htmlFor="ep-web" error={e.website}><Input id="ep-web" name="website" type="url" defaultValue={employer.website ?? ''} placeholder="https://" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="State" htmlFor="ep-state" error={e.state}>
          <Select id="ep-state" name="state" defaultValue={employer.state ?? ''}><option value="">Not set</option>{NIGERIAN_STATES.map((s) => <option key={s}>{s}</option>)}</Select>
        </Field>
        <Field label="Team size" htmlFor="ep-size" error={e.size}>
          <Select id="ep-size" name="size" defaultValue={employer.size ?? ''}><option value="">Not set</option>{['1-10', '11-50', '51-200', '201+'].map((s) => <option key={s} value={s}>{s} people</option>)}</Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact person" htmlFor="ep-cn" error={e.contact_name}><Input id="ep-cn" name="contact_name" defaultValue={employer.contact_name ?? ''} /></Field>
        <Field label="Contact phone" htmlFor="ep-cp" error={e.contact_phone}><Input id="ep-cp" name="contact_phone" type="tel" defaultValue={employer.contact_phone ?? ''} /></Field>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Saving…' : 'Save profile'}</Button>
        {state.message && <span className={`text-sm ${state.ok ? 'text-teal-700' : 'text-danger'}`}>{state.message}</span>}
      </div>
    </form>
  );
}
