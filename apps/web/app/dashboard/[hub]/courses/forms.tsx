'use client';
import { useActionState, useEffect, useId, useRef, useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { LessonIcon } from '@/components/lesson-icon';
import { LESSON_KINDS, type LessonKind } from '@talentral/domain';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { keepValues } from '@/lib/keep-values';
import { addLesson, addModule, createCourse, deleteModule, saveCourse, saveModule, setCohortCourse, setCourseStatus, type CourseState } from './actions';

type Programme = { id: string; title: string };

export function NewCourseForm({ slug, programmes }: { slug: string; programmes: Pick<Programme, 'id' | 'title'>[] }) {
  const [state, action] = useActionState<CourseState, FormData>(createCourse.bind(null, slug), {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="grid gap-5">
      <Field label="Course title" htmlFor="co-title" required error={e.title}><Input id="co-title" name="title" maxLength={160} placeholder="Web development foundations" autoFocus /></Field>
      <Field label="For programme" htmlFor="co-prog" hint="Optional. A course can serve any programme.">
        <Select id="co-prog" name="programme_id" defaultValue=""><option value="">Any programme</option>{programmes.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>
      </Field>
      <div className="flex justify-end border-t border-line pt-5"><SubmitButton pendingLabel="Creating…">Create course</SubmitButton></div>
    </form>
  );
}

// Tracks the library groups its courses by; a library course can name another.
const LIBRARY_TRACKS = ['Digital skills', 'Digital marketing', 'Data analysis', 'Web development', 'Design', 'Entrepreneurship'];

export function CourseDetailsForm({ slug, courseId, title, summary, programmeId, programmes, library = false, track = null }: {
  slug: string; courseId: string; title: string; summary: string | null; programmeId: string | null; programmes: Programme[];
  // In the Course Library a course has a track that hubs browse by, instead of a programme.
  library?: boolean; track?: string | null;
}) {
  const [state, action, pending] = useActionState<CourseState, FormData>(saveCourse.bind(null, slug, courseId), {});
  const e = state.errors ?? {};
  return (
    <form onSubmit={keepValues(action)} className="grid gap-4">
      <Field label="Course title" htmlFor="cd-title" required error={e.title}><Input id="cd-title" name="title" defaultValue={title} maxLength={160} /></Field>
      <Field label="Summary" htmlFor="cd-summary" error={e.summary} hint="Shown to learners at the top of the course."><Textarea id="cd-summary" name="summary" rows={3} defaultValue={summary ?? ''} maxLength={600} /></Field>
      {library ? (
        <Field label="Track" htmlFor="cd-track" error={e.track} hint="Hubs browse the library by track.">
          <Input id="cd-track" name="track" defaultValue={track ?? ''} maxLength={60} list="cd-tracks" placeholder="Digital skills" />
          <datalist id="cd-tracks">{LIBRARY_TRACKS.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
      ) : (
        <Field label="For programme" htmlFor="cd-prog">
          <Select id="cd-prog" name="programme_id" defaultValue={programmeId ?? ''}><option value="">Any programme</option>{programmes.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>
        </Field>
      )}
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

// One "+ Add lesson" per module: pick the kind from a short menu, then name the lesson. The new
// lesson opens straight away for its content.
export function AddLessonMenu({ slug, courseId, moduleId, moduleTitle }: { slug: string; courseId: string; moduleId: string; moduleTitle: string }) {
  const [state, action] = useActionState<CourseState, FormData>(addLesson.bind(null, slug, courseId, moduleId), {});
  const [menu, setMenu] = useState(false);
  const [kind, setKind] = useState<LessonKind | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLInputElement>(null);
  const id = useId();
  const e = state.errors ?? {};
  useEffect(() => { if (menu) first.current?.focus(); }, [menu]);
  useEffect(() => { if (kind) title.current?.focus(); }, [kind]);
  useEffect(() => {
    if (!menu) return;
    const away = (ev: MouseEvent) => { if (box.current && !box.current.contains(ev.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [menu]);
  const onMenuKey = (ev: React.KeyboardEvent) => {
    const items = [...(box.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (ev.key === 'ArrowDown') { ev.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); setMenu(false); }
  };

  if (kind) {
    return (
      <form action={action} className="flex flex-col gap-2 rounded-xl border border-blue/25 bg-blue-50/40 p-3 sm:flex-row sm:items-start">
        <input type="hidden" name="kind" value={kind} />
        <span className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-white px-3 text-sm font-medium"><LessonIcon kind={kind} />{LESSON_KINDS[kind]}</span>
        <div className="min-w-0 flex-1">
          <Input ref={title} name="title" aria-label="New lesson title" placeholder={`${LESSON_KINDS[kind]} title`} maxLength={160} aria-invalid={e.title ? true : undefined} />
          {e.title && <p className="mt-1 text-sm text-danger">{e.title}</p>}
        </div>
        <div className="flex gap-2">
          <SubmitButton pendingLabel="Adding…">Add lesson</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setKind(null)}>Cancel</Button>
        </div>
      </form>
    );
  }
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu} aria-controls={id} aria-label={`Add a lesson to ${moduleTitle}`}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-sm font-medium text-muted transition-colors hover:border-blue/50 hover:bg-blue-50/40 hover:text-blue">
        <Plus className="size-4" aria-hidden />Add lesson
      </button>
      {menu && (
        <div id={id} role="menu" aria-label="Lesson type" onKeyDown={onMenuKey}
          className="absolute left-0 top-full z-30 mt-1.5 grid w-full gap-1 rounded-[var(--radius-card)] border border-line bg-white p-1.5 shadow-[var(--shadow-pop)] sm:w-[26rem] sm:grid-cols-2">
          {(Object.keys(LESSON_KINDS) as LessonKind[]).map((k, i) => (
            <button key={k} ref={i === 0 ? first : undefined} type="button" role="menuitem" onClick={() => { setKind(k); setMenu(false); }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-hover focus-visible:bg-hover">
              <span className="grid size-8 shrink-0 place-items-center rounded-md border border-line bg-white text-muted"><LessonIcon kind={k} /></span>
              <span><span className="block text-sm font-medium">{LESSON_KINDS[k]}</span><span className="block text-xs text-muted">{KIND_HINTS[k]}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const KIND_HINTS: Record<LessonKind, string> = {
  text: 'Text with headings and lists', video: 'YouTube, Vimeo or upload', audio: 'A recording to listen to',
  pdf: 'A document to read or download', quiz: 'Marked automatically', assignment: 'Handed in and graded',
};

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
