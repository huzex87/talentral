'use client';
import { useActionState, useState, useTransition } from 'react';
import { CANDIDATE_STAGES, JOB_TYPES, NIGERIAN_STATES, WORK_MODES } from '@talentral/domain';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { SkillListInput } from '@/components/skill-list-input';
import { SubmitButton } from '@/components/submit-button';
import { keepValues } from '@/lib/keep-values';
import type { EmployerAccount } from '@/lib/employer';
import { addTeamMember, changeTeamMember, inviteCandidate, postJob, requestReview, saveEmployerProfile, saveJob, updateApplicant, type EmployerState } from './actions';

export interface JobValues {
  id: string; title: string; description: string | null; requirements: string | null; skills: string[]; work_mode: string; job_type: string; state: string | null;
  pay_min: number | null; pay_max: number | null; openings: number; closes_on: string | null; on_board: boolean; status: string;
}

// New job (publish or save as a draft) or edit an existing one.
export function JobForm({ skills, job }: { skills: { name: string; track: string }[]; job?: JobValues }) {
  const [state, action] = useActionState<EmployerState, FormData>(job ? saveJob.bind(null, job.id) : postJob, {});
  const e = state.errors ?? {};
  const p = job ? `jb-${job.id.slice(0, 8)}` : 'jb';
  return (
    <form onSubmit={keepValues(action)} className="grid gap-4 sm:grid-cols-2">
      {state.message && <div className="sm:col-span-2"><Alert tone={state.ok ? 'teal' : 'danger'}>{state.message}</Alert></div>}
      <div className="sm:col-span-2"><Field label="Job title" htmlFor={`${p}-title`} required error={e.title}><Input id={`${p}-title`} name="title" maxLength={160} defaultValue={job?.title} placeholder="Junior frontend developer" /></Field></div>
      <div className="sm:col-span-2">
        <Field label="Required skills" htmlFor={`${p}-skills`} required error={e.skills} hint="Separate with commas, or pick from the skills list. Matches are ranked on these, and learners see which ones they have proven.">
          <SkillListInput id={`${p}-skills`} name="skills" suggestions={skills} defaultValue={job?.skills.join(', ')} invalid={Boolean(e.skills)} />
        </Field>
      </div>
      <Field label="Work mode" htmlFor={`${p}-mode`} error={e.work_mode}>
        <Select id={`${p}-mode`} name="work_mode" defaultValue={job?.work_mode ?? 'remote'}>{Object.entries(WORK_MODES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      </Field>
      <Field label="Type" htmlFor={`${p}-type`} error={e.job_type}>
        <Select id={`${p}-type`} name="job_type" defaultValue={job?.job_type ?? 'full_time'}>{Object.entries(JOB_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      </Field>
      <Field label="Based in (state)" htmlFor={`${p}-state`} error={e.state} hint="Needed for hybrid and on-site jobs.">
        <Select id={`${p}-state`} name="state" defaultValue={job?.state ?? ''}><option value="">Anywhere (remote)</option>{NIGERIAN_STATES.map((s) => <option key={s}>{s}</option>)}</Select>
      </Field>
      <Field label="Openings" htmlFor={`${p}-open`} error={e.openings}><Input id={`${p}-open`} name="openings" type="number" min={1} max={500} defaultValue={job?.openings ?? 1} inputMode="numeric" /></Field>
      <Field label="Pay from (₦ a month)" htmlFor={`${p}-min`} required error={e.pay_min}><Input id={`${p}-min`} name="pay_min" inputMode="numeric" defaultValue={job?.pay_min ?? ''} placeholder="150000" /></Field>
      <Field label="Pay up to (₦ a month)" htmlFor={`${p}-max`} required error={e.pay_max}><Input id={`${p}-max`} name="pay_max" inputMode="numeric" defaultValue={job?.pay_max ?? ''} placeholder="250000" /></Field>
      <div className="sm:col-span-2">
        <Field label="Job description" htmlFor={`${p}-desc`} required error={e.description}>
          <Textarea id={`${p}-desc`} name="description" rows={5} maxLength={4000} defaultValue={job?.description ?? ''} placeholder="What the person will do, who they will work with, hours, and how you will support them." />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Requirements" htmlFor={`${p}-req`} error={e.requirements} hint="Optional. Experience, tools or documents you need. Keep it to what truly matters: long lists put good people off.">
          <Textarea id={`${p}-req`} name="requirements" rows={3} maxLength={3000} defaultValue={job?.requirements ?? ''} placeholder="A laptop. Able to work 9:00 to 17:00 WAT." />
        </Field>
      </div>
      <Field label="Closing date" htmlFor={`${p}-close`} error={e.closes_on} hint="Optional. The job leaves the board after this day.">
        <Input id={`${p}-close`} name="closes_on" type="date" defaultValue={job?.closes_on ?? ''} />
      </Field>
      <label className="flex items-start gap-3 self-end rounded-[var(--radius-control)] border border-line bg-canvas/40 px-4 py-3 text-sm">
        <input type="checkbox" name="on_board" defaultChecked={job ? job.on_board : true} className="mt-0.5 size-4 accent-[var(--color-blue)]" />
        <span><b>List on the Talentral jobs board</b> <span className="text-muted">Learners can find it. Untick to fill it by invitation only.</span></span>
      </label>
      <div className="sm:col-span-2 flex flex-wrap gap-2">
        {!job && <><SubmitButton name="intent" value="publish" pendingLabel="Posting…">Publish job and see matches</SubmitButton>
          <Button type="submit" name="intent" value="draft" variant="ghost">Save as draft</Button></>}
        {job && job.status === 'draft' && <><SubmitButton name="intent" value="publish" pendingLabel="Publishing…">Save and publish</SubmitButton>
          <Button type="submit" name="intent" value="save" variant="ghost">Save draft</Button></>}
        {job && job.status !== 'draft' && <SubmitButton name="intent" value="save" variant="secondary" pendingLabel="Saving…">Save changes</SubmitButton>}
      </div>
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
      <Field label="CAC registration number" htmlFor="ep-cac" error={e.cac_number} hint="As on your certificate, for example RC 1234567 or BN 2345678. We check it before verifying you.">
        <Input id="ep-cac" name="cac_number" defaultValue={employer.cac_number ?? ''} placeholder="RC 1234567" autoCapitalize="characters" />
      </Field>
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

export function RequestReviewButton() {
  const [state, action] = useActionState<EmployerState, FormData>(requestReview, {});
  if (state.ok) return <p role="status" className="font-semibold">{state.message}</p>;
  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-3">
      <SubmitButton size="sm" pendingLabel="Sending…">I have updated my details: ask for another review</SubmitButton>
      {state.message && <span className="text-sm">{state.message}</span>}
    </form>
  );
}

export function AddMemberForm() {
  const [state, action] = useActionState<EmployerState, FormData>(addTeamMember, {});
  const e = state.errors ?? {};
  return (
    <form key={state.ok ? state.message : 'add'} action={action} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px]">
      {state.message && <div className="sm:col-span-3"><Alert tone={state.ok ? 'teal' : 'danger'}>{state.message}</Alert></div>}
      <Field label="Work email" htmlFor="tm-email" required error={e.email}><Input id="tm-email" name="email" type="email" autoComplete="off" placeholder="colleague@company.ng" /></Field>
      <Field label="Name" htmlFor="tm-name" error={e.full_name}><Input id="tm-name" name="full_name" maxLength={120} /></Field>
      <Field label="Role" htmlFor="tm-role">
        <Select id="tm-role" name="role" defaultValue="member"><option value="member">Member</option><option value="owner">Owner</option></Select>
      </Field>
      <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel="Adding…">Add to team</SubmitButton>
        <span className="text-xs text-muted">Members post jobs and hire. Owners also manage the team and the organisation profile.</span>
      </div>
    </form>
  );
}

export function MemberActions({ id, name, role, self, owner }: { id: string; name: string; role: 'owner' | 'member'; self: boolean; owner: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (next: 'owner' | 'member' | null, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    start(async () => { const r = await changeTeamMember(id, next); setError(r.ok ? null : r.message ?? null); });
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {owner && !self && (role === 'member'
          ? <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run('owner')} aria-label={`Make ${name} an owner`}>Make owner</Button>
          : <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run('member')} aria-label={`Make ${name} a member`}>Make member</Button>)}
        {owner && !self && <Button type="button" size="sm" variant="ghost" className="text-danger" disabled={pending} onClick={() => run(null, `Remove ${name} from the team?`)} aria-label={`Remove ${name}`}>Remove</Button>}
        {self && <Button type="button" size="sm" variant="ghost" className="text-danger" disabled={pending} onClick={() => run(null, 'Leave this organisation? You will lose access to its jobs.')}>Leave</Button>}
      </div>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </div>
  );
}
