'use client';
import { useActionState, useState, useTransition } from 'react';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { keepValues } from '@/lib/keep-values';
import { addPathCourse, createPath, savePath, setCohortPath, setPathStatus, type PathState } from './actions';

export function NewPathForm({ slug }: { slug: string }) {
  const [state, action] = useActionState<PathState, FormData>(createPath.bind(null, slug), {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <Field label="Path title" htmlFor="pa-title" required error={e.title}><Input id="pa-title" name="title" maxLength={120} placeholder="Frontend developer" /></Field>
      <Field label="Leads to (optional)" htmlFor="pa-outcome" error={e.outcome}><Input id="pa-outcome" name="outcome" maxLength={120} placeholder="Junior frontend developer" /></Field>
      <SubmitButton pendingLabel="Creating…">Create path</SubmitButton>
    </form>
  );
}

type Details = { title: string; title_ha: string | null; summary: string | null; summary_ha: string | null; outcome: string | null; sequential: boolean };

export function PathDetailsForm({ slug, pathId, p }: { slug: string; pathId: string; p: Details }) {
  const [state, action, pending] = useActionState<PathState, FormData>(savePath.bind(null, slug, pathId), {});
  const e = state.errors ?? {};
  return (
    <form onSubmit={keepValues(action)} className="grid gap-4 sm:grid-cols-2">
      <Field label="Title" htmlFor="pd-title" required error={e.title}><Input id="pd-title" name="title" defaultValue={p.title} maxLength={120} /></Field>
      <Field label="Title in Hausa" htmlFor="pd-title-ha" error={e.title_ha}><Input id="pd-title-ha" name="title_ha" defaultValue={p.title_ha ?? ''} maxLength={120} lang="ha" /></Field>
      <div className="sm:col-span-2"><Field label="Leads to" htmlFor="pd-outcome" error={e.outcome} hint="The kind of job the path prepares people for."><Input id="pd-outcome" name="outcome" defaultValue={p.outcome ?? ''} maxLength={120} placeholder="Junior frontend developer" /></Field></div>
      <Field label="Summary" htmlFor="pd-summary" error={e.summary}><Textarea id="pd-summary" name="summary" rows={3} defaultValue={p.summary ?? ''} maxLength={600} /></Field>
      <Field label="Summary in Hausa" htmlFor="pd-summary-ha" error={e.summary_ha}><Textarea id="pd-summary-ha" name="summary_ha" rows={3} defaultValue={p.summary_ha ?? ''} maxLength={600} lang="ha" /></Field>
      <label className="flex items-start gap-3 text-sm sm:col-span-2">
        <input type="checkbox" name="sequential" defaultChecked={p.sequential} className="mt-0.5 size-4 accent-[var(--color-blue)]" />
        <span><span className="font-semibold">One course at a time</span><span className="block text-muted">Each course opens once the learner has finished every lesson in the one before. Untick to open all courses together.</span></span>
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Saving…' : 'Save details'}</Button>
        {state.message && <span role="status" className="text-sm text-teal-700">{state.message}</span>}
      </div>
    </form>
  );
}

export function AddCourseForm({ slug, pathId, courses }: { slug: string; pathId: string; courses: { id: string; title: string; status: string }[] }) {
  const [state, action, pending] = useActionState<PathState, FormData>(addPathCourse.bind(null, slug, pathId), {});
  if (!courses.length) return <p className="text-sm text-muted">Every course of your hub is already in this path. Create more courses to add them.</p>;
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Field label="Add a course" htmlFor="pc-course" error={state.errors?.course_id}>
          <Select id="pc-course" name="course_id" defaultValue=""><option value="">Choose a course</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}{c.status === 'draft' ? ' (draft)' : ''}</option>)}</Select>
        </Field>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Adding…' : 'Add to path'}</Button>
    </form>
  );
}

export function PublishPathButton({ slug, pathId, status }: { slug: string; pathId: string; status: 'draft' | 'published' }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PathState | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant={status === 'published' ? 'secondary' : 'primary'} disabled={pending}
        onClick={() => start(async () => setResult(await setPathStatus(slug, pathId, status === 'published' ? 'draft' : 'published')))}>
        {pending ? 'Saving…' : status === 'published' ? 'Unpublish' : 'Publish path'}
      </Button>
      {result?.message && <span role="status" className={`text-sm ${result.ok ? 'text-teal-700' : 'text-danger'}`}>{result.message}</span>}
    </div>
  );
}

// On the cohort page: follow a learning path instead of a single course.
export function CohortPathPicker({ slug, cohortId, pathId, paths }: { slug: string; cohortId: string; pathId: string | null; paths: { id: string; title: string; status: string }[] }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PathState | null>(null);
  const [value, setValue] = useState(pathId ?? '');
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select aria-label="Learning path for this cohort" value={value} onChange={(e) => setValue(e.target.value)} className="flex-1">
          <option value="">No learning path</option>
          {paths.map((p) => <option key={p.id} value={p.id}>{p.title}{p.status === 'draft' ? ' (draft)' : ''}</option>)}
        </Select>
        <Button variant="secondary" disabled={pending || value === (pathId ?? '')} onClick={() => start(async () => setResult(await setCohortPath(slug, cohortId, value || null)))}>
          {pending ? 'Saving…' : 'Use this path'}
        </Button>
      </div>
      {result?.message && <Alert tone={result.ok ? 'teal' : 'amber'}>{result.message}</Alert>}
    </div>
  );
}
