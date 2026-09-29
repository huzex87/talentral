'use client';
import { useActionState, useState, useTransition } from 'react';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { ASSESSMENT_KINDS } from '@talentral/domain';
import { SkillPicker, type SkillChoice } from '@/components/skill-picker';
import { admitAccepted, createAssessment, createSession, issueCertificates, postAnnouncement, saveCohortDates, type FormState } from '../actions';
import { keepValues } from '@/lib/keep-values';

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
      <Field label="Venue" htmlFor="s-location" error={e.location}><Input id="s-location" name="location" placeholder="Hub training room" maxLength={300} /></Field>
      <Field label="Facilitator" htmlFor="s-facilitator" error={e.facilitator}><Input id="s-facilitator" name="facilitator" maxLength={120} /></Field>
      <div className="sm:col-span-2 lg:col-span-3">
        <Field label="Meeting link (online or hybrid)" htmlFor="s-meeting" error={e.meeting_url} hint="Google Meet, Zoom, Jitsi or any https link. Learners join from Talentral, and joining marks them present.">
          <Input id="s-meeting" name="meeting_url" type="url" inputMode="url" placeholder="https://meet.google.com/…" maxLength={500} />
        </Field>
      </div>
      <div className="sm:col-span-2 lg:col-span-3"><SubmitButton pendingLabel="Adding…">Add session</SubmitButton></div>
    </form>
  );
}

export type { SkillChoice } from '@/components/skill-picker';

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
      {skills.length > 0 && <div className="sm:col-span-2 lg:col-span-3"><SkillPicker skills={skills} /></div>}
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

export function CohortDatesForm({ slug, cohortId, startsOn, endsOn }: { slug: string; cohortId: string; startsOn: string | null; endsOn: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCohortDates.bind(null, slug, cohortId), {});
  const e = state.errors ?? {};
  return (
    <form onSubmit={keepValues(action)} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Field label="Cohort starts" htmlFor="cd-start" error={e.starts_on} hint="Modules open counting from this date."><Input id="cd-start" name="starts_on" type="date" defaultValue={startsOn ?? ''} /></Field>
      <Field label="Cohort ends" htmlFor="cd-end" error={e.ends_on}><Input id="cd-end" name="ends_on" type="date" defaultValue={endsOn ?? ''} /></Field>
      <div className="flex items-center gap-2 sm:pb-6">
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Saving…' : 'Save dates'}</Button>
        {state.ok && <span className="text-sm text-teal-700">✓</span>}
      </div>
    </form>
  );
}

export function AnnouncementForm({ slug, cohortId, sms }: { slug: string; cohortId: string; sms: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(postAnnouncement.bind(null, slug, cohortId), {});
  const e = state.errors ?? {};
  return (
    <form key={state.ok ? state.message : 'an'} action={action} className="space-y-3">
      {state.ok && <Alert tone="teal">{state.message}</Alert>}
      <Field label="Announcement title" htmlFor="an-title" required error={e.title}><Input id="an-title" name="title" maxLength={160} placeholder="Room change for Thursday" /></Field>
      <Field label="Message" htmlFor="an-body" required error={e.body}><Textarea id="an-body" name="body" rows={3} maxLength={5000} /></Field>
      <fieldset className="flex flex-wrap items-center gap-4 text-sm">
        <legend className="sr-only">Also send by</legend>
        <span className="text-muted">Always shown on My learning. Also send by:</span>
        <label className="flex items-center gap-2"><input type="checkbox" name="channels" value="email" defaultChecked className="size-4 accent-[var(--color-blue)]" />Email</label>
        <label className={`flex items-center gap-2 ${sms ? '' : 'text-muted'}`}><input type="checkbox" name="channels" value="sms" disabled={!sms} className="size-4 accent-[var(--color-blue)]" />SMS{!sms && ' (not set up)'}</label>
      </fieldset>
      {e.channels && <p className="text-sm text-danger">{e.channels}</p>}
      <SubmitButton pendingLabel="Posting…">Post announcement</SubmitButton>
    </form>
  );
}
