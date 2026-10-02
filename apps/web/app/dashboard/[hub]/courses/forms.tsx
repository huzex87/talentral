'use client';
import { useActionState, useState, useTransition } from 'react';
import { LESSON_KINDS } from '@talentral/domain';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { keepValues } from '@/lib/keep-values';
import { addLesson, addModule, createCourse, deleteModule, saveCourse, saveModule, setCohortCourse, setCourseStatus, type CourseState } from './actions';

type Programme = { id: string; title: string };

export function NewCourseForm({ slug, programmes }: { slug: string; programmes: Programme[] }) {
  const [state, action] = useActionState<CourseState, FormData>(createCourse.bind(null, slug), {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_260px_auto] sm:items-end">
      <Field label="Course title" htmlFor="co-title" required error={e.title}><Input id="co-title" name="title" maxLength={160} placeholder="Web development foundations" /></Field>
      <Field label="For programme" htmlFor="co-prog">
        <Select id="co-prog" name="programme_id" defaultValue=""><option value="">Any programme</option>{programmes.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>
      </Field>
      <SubmitButton pendingLabel="Creating…">Create course</SubmitButton>
    </form>
  );
}

export function CourseDetailsForm({ slug, courseId, title, summary, programmeId, programmes }: { slug: string; courseId: string; title: string; summary: string | null; programmeId: string | null; programmes: Programme[] }) {
  const [state, action, pending] = useActionState<CourseState, FormData>(saveCourse.bind(null, slug, courseId), {});
  const e = state.errors ?? {};
  return (
    <form onSubmit={keepValues(action)} className="grid gap-4">
      <Field label="Course title" htmlFor="cd-title" required error={e.title}><Input id="cd-title" name="title" defaultValue={title} maxLength={160} /></Field>
      <Field label="Summary" htmlFor="cd-summary" error={e.summary} hint="Shown to learners at the top of the course."><Textarea id="cd-summary" name="summary" rows={3} defaultValue={summary ?? ''} maxLength={600} /></Field>
      <Field label="For programme" htmlFor="cd-prog">
        <Select id="cd-prog" name="programme_id" defaultValue={programmeId ?? ''}><option value="">Any programme</option>{programmes.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Saving…' : 'Save details'}</Button>
        {state.message && <span className="text-sm text-teal-700">{state.message}</span>}
      </div>
    </form>
  );
}

export function PublishControl({ slug, courseId, status, previewHref }: { slug: string; courseId: string; status: 'draft' | 'published'; previewHref?: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CourseState | null>(null);
  const next = status === 'draft' ? 'published' : 'draft';
  return (
    <div className="space-y-2">
      <Button variant={status === 'draft' ? 'primary' : 'secondary'} disabled={pending} onClick={() => start(async () => setResult(await setCourseStatus(slug, courseId, next)))}>
        {pending ? 'Saving…' : status === 'draft' ? 'Publish course' : 'Unpublish'}
      </Button>
      {result?.message && <Alert tone={result.ok ? 'teal' : 'amber'}>{result.message}{result.ok && previewHref && <> <a href={previewHref} className="font-semibold underline">Preview the course</a></>}</Alert>}
    </div>
  );
}

export function AddModuleForm({ slug, courseId }: { slug: string; courseId: string }) {
  const [state, action] = useActionState<CourseState, FormData>(addModule.bind(null, slug, courseId), {});
  return (
    <form key={state.ok ? state.message : 'm'} action={action} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="flex-1"><Field label="New module" htmlFor="mod-title" error={state.errors?.title}><Input id="mod-title" name="title" placeholder="Week 2: Styling with CSS" maxLength={160} /></Field></div>
      <div className="sm:pt-7"><SubmitButton pendingLabel="Adding…" variant="secondary">Add module</SubmitButton></div>
    </form>
  );
}

export function ModuleSettings({ slug, courseId, module: m }: { slug: string; courseId: string; module: { id: string; title: string; title_ha: string | null; unlock_after_days: number | null } }) {
  const [state, action, pending] = useActionState<CourseState, FormData>(saveModule.bind(null, slug, courseId, m.id), {});
  const [removing, start] = useTransition();
  const [result, setResult] = useState<CourseState | null>(null);
  const e = state.errors ?? {};
  return (
    <details className="rounded-xl border border-line bg-canvas/50 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-semibold text-muted">Module settings</summary>
      <form onSubmit={keepValues(action)} className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Title" htmlFor={`mt-${m.id}`} error={e.title}><Input id={`mt-${m.id}`} name="title" defaultValue={m.title} /></Field>
        <Field label="Title in Hausa" htmlFor={`mh-${m.id}`}><Input id={`mh-${m.id}`} name="title_ha" defaultValue={m.title_ha ?? ''} placeholder="Mako na 1" /></Field>
        <Field label="Opens (days after cohort start)" htmlFor={`mu-${m.id}`} error={e.unlock_after_days} hint="Blank opens it straight away.">
          <Input id={`mu-${m.id}`} name="unlock_after_days" inputMode="numeric" defaultValue={m.unlock_after_days ?? ''} placeholder="7" />
        </Field>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
          <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving…' : 'Save module'}</Button>
          <Button type="button" size="sm" variant="ghost" className="text-danger" disabled={removing} onClick={() => start(async () => setResult(await deleteModule(slug, courseId, m.id)))}>Delete module</Button>
          {(result?.message || state.message) && <span className={result && !result.ok ? 'text-amber-800' : 'text-teal-700'}>{result?.message ?? state.message}</span>}
        </div>
      </form>
    </details>
  );
}

export function AddLessonForm({ slug, courseId, moduleId }: { slug: string; courseId: string; moduleId: string }) {
  const [state, action] = useActionState<CourseState, FormData>(addLesson.bind(null, slug, courseId, moduleId), {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:items-start">
      <Select name="kind" aria-label="Lesson type" defaultValue="text">{Object.entries(LESSON_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
      <div>
        <Input name="title" aria-label="New lesson title" placeholder="Lesson title" maxLength={160} aria-invalid={e.title ? true : undefined} />
        {e.title && <p className="mt-1 text-sm text-danger">{e.title}</p>}
      </div>
      <SubmitButton size="sm" pendingLabel="Adding…">Add lesson</SubmitButton>
    </form>
  );
}

export function CohortCoursePicker({ slug, cohortId, courseId, courses }: { slug: string; cohortId: string; courseId: string | null; courses: { id: string; title: string; status: string }[] }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CourseState | null>(null);
  const [value, setValue] = useState(courseId ?? '');
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select aria-label="Course for this cohort" value={value} onChange={(e) => setValue(e.target.value)} className="flex-1">
          <option value="">No course</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}{c.status === 'draft' ? ' (draft)' : ''}</option>)}
        </Select>
        <Button variant="secondary" disabled={pending || value === (courseId ?? '')} onClick={() => start(async () => setResult(await setCohortCourse(slug, cohortId, value || null)))}>
          {pending ? 'Saving…' : 'Use this course'}
        </Button>
      </div>
      {result?.message && <Alert tone={result.ok ? 'teal' : 'amber'}>{result.message}</Alert>}
    </div>
  );
}
