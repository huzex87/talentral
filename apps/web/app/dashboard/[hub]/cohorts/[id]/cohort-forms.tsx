'use client';
import { useActionState, useState, useTransition } from 'react';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { ASSESSMENT_KINDS } from '@talentral/domain';
import { admitAccepted, createAssessment, createSession, issueCertificates, type FormState } from '../actions';

export function AdmitButton({ slug, cohortId, waiting }: { slug: string; cohortId: string; waiting: number }) {
  const [result, setResult] = useState<FormState | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button disabled={pending || waiting === 0} onClick={() => start(async () => setResult(await admitAccepted(slug, cohortId)))}>
        {pending ? 'Adding…' : waiting ? `Add ${waiting} accepted ${waiting === 1 ? 'applicant' : 'applicants'}` : 'Everyone accepted is enrolled'}
      </Button>
      {result?.message && <Alert tone={result.ok ? 'teal' : 'amber'}>{result.message}</Alert>}
    </div>
  );
}

export function NewSessionForm({ slug, cohortId }: { slug: string; cohortId: string }) {
  const [state, action] = useActionState<FormState, FormData>(createSession.bind(null, slug, cohortId), {});
  const e = state.errors ?? {};
  return (
    <form key={state.ok ? state.message : 'form'} action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {state.ok && <div className="sm:col-span-2 lg:col-span-3"><Alert tone="teal">{state.message}</Alert></div>}
      <Field label="Session title" htmlFor="s-title" required error={e.title}><Input id="s-title" name="title" placeholder="Week 1: Introduction to HTML" maxLength={160} /></Field>
      <Field label="Starts (WAT)" htmlFor="s-start" required error={e.starts_at}><Input id="s-start" name="starts_at" type="datetime-local" /></Field>
      <Field label="Length" htmlFor="s-duration" error={e.duration}>
        <Select id="s-duration" name="duration" defaultValue="120">{[[60, '1 hour'], [90, '1½ hours'], [120, '2 hours'], [180, '3 hours'], [240, '4 hours'], [360, '6 hours'], [480, 'Full day (8 hours)']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
      </Field>
      <Field label="Format" htmlFor="s-mode" error={e.mode}>
        <Select id="s-mode" name="mode" defaultValue="in_person"><option value="in_person">In person</option><option value="online">Online</option><option value="hybrid">Hybrid</option></Select>
      </Field>
      <Field label="Venue or link" htmlFor="s-location" error={e.location}><Input id="s-location" name="location" placeholder="Hub training room, or a Google Meet link" maxLength={300} /></Field>
      <Field label="Facilitator" htmlFor="s-facilitator" error={e.facilitator}><Input id="s-facilitator" name="facilitator" maxLength={120} /></Field>
      <div className="sm:col-span-2 lg:col-span-3"><SubmitButton pendingLabel="Adding…">Add session</SubmitButton></div>
    </form>
  );
}

export interface SkillChoice { id: string; name: string; track: string; hub: boolean; suggested: boolean }

// Chips for tagging an assessment with the skills it shows. Skills on the programme's tracks come
// first; the whole taxonomy is one click away.
function SkillPicker({ skills }: { skills: SkillChoice[] }) {
  const suggested = skills.filter((s) => s.suggested);
  const others = skills.filter((s) => !s.suggested);
  const tracks = [...new Set(others.map((s) => s.track))];
  const chip = (s: SkillChoice) => (
    <label key={s.id} className="cursor-pointer">
      <input type="checkbox" name="skills" value={s.id} className="peer sr-only" />
      <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold text-muted transition peer-checked:border-violet peer-checked:bg-violet-50 peer-checked:text-violet peer-focus-visible:ring-2 peer-focus-visible:ring-violet/40">
        {s.name}{s.hub && <span className="text-[10px] uppercase tracking-wide opacity-70">hub</span>}
      </span>
    </label>
  );
  return (
    <fieldset className="space-y-2 sm:col-span-2 lg:col-span-3">
      <legend className="text-sm font-semibold">Skills this assessment shows</legend>
      <p className="text-sm text-muted">Learners who reach the pass mark get these as platform-evidenced skills on their Passport.</p>
      {suggested.length > 0 && <div className="flex flex-wrap gap-1.5">{suggested.map(chip)}</div>}
      {others.length > 0 && (
        <details className="rounded-xl border border-line bg-canvas/50 px-3 py-2" open={suggested.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold text-muted">{suggested.length ? 'More skills from other tracks' : 'Choose from the skills list'}</summary>
          <div className="mt-3 space-y-3">
            {tracks.map((t) => (
              <div key={t}><p className="mb-1.5 text-xs font-bold uppercase tracking-[0.08em] text-muted">{t}</p><div className="flex flex-wrap gap-1.5">{others.filter((s) => s.track === t).map(chip)}</div></div>
            ))}
          </div>
        </details>
      )}
    </fieldset>
  );
}

export function NewAssessmentForm({ slug, cohortId, passMark, skills }: { slug: string; cohortId: string; passMark: number; skills: SkillChoice[] }) {
  const [state, action] = useActionState<FormState, FormData>(createAssessment.bind(null, slug, cohortId), {});
  const e = state.errors ?? {};
  return (
    <form key={state.ok ? state.message : 'form'} action={action} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {state.ok && <div className="sm:col-span-2 lg:col-span-3"><Alert tone="teal">{state.message}</Alert></div>}
      <Field label="Assessment title" htmlFor="as-title" required error={e.title}><Input id="as-title" name="title" placeholder="Build a landing page" maxLength={160} /></Field>
      <Field label="Type" htmlFor="as-kind" error={e.kind}>
        <Select id="as-kind" name="kind" defaultValue="assignment">{Object.entries(ASSESSMENT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      </Field>
      <Field label="Due" htmlFor="as-due" error={e.due_on}><Input id="as-due" name="due_on" type="date" /></Field>
      <Field label="Scored out of" htmlFor="as-max" error={e.max_score}><Input id="as-max" name="max_score" type="number" inputMode="numeric" min={1} max={1000} defaultValue={100} /></Field>
      <Field label="Importance" htmlFor="as-weight" error={e.weight} hint="Counts this many times towards the overall score.">
        <Select id="as-weight" name="weight" defaultValue="1">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>×{n}</option>)}</Select>
      </Field>
      <Field label="Pass mark for the cohort (%)" htmlFor="as-pass" error={e.pass_mark} hint="Overall weighted score needed to complete.">
        <Input id="as-pass" name="pass_mark" type="number" inputMode="numeric" min={0} max={100} defaultValue={passMark} />
      </Field>
      {skills.length > 0 && <SkillPicker skills={skills} />}
      <div className="sm:col-span-2 lg:col-span-3"><SubmitButton pendingLabel="Adding…">Add assessment</SubmitButton></div>
    </form>
  );
}

export function IssueCertificatesButton({ slug, cohortId, waiting }: { slug: string; cohortId: string; waiting: number }) {
  const [result, setResult] = useState<FormState | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button disabled={pending || waiting === 0} onClick={() => start(async () => setResult(await issueCertificates(slug, cohortId)))}>
        {pending ? 'Issuing…' : waiting ? `Issue ${waiting} ${waiting === 1 ? 'certificate' : 'certificates'}` : 'All certificates issued'}
      </Button>
      {result?.message && <Alert tone={result.ok ? 'teal' : 'amber'}>{result.message}</Alert>}
    </div>
  );
}
