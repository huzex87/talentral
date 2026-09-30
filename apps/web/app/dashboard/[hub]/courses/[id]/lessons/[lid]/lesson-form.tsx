'use client';
import { useActionState, useState } from 'react';
import { LESSON_FILES, formatBytes, type LessonKind } from '@talentral/domain';
import { DirectUpload } from '@/components/direct-upload';
import { SkillPicker } from '@/components/skill-picker';
import { Alert, Button, Field, Input, Select, Textarea, cx } from '@/components/ui';
import { keepValues } from '@/lib/keep-values';
import { prepareLessonUpload, saveLesson, type CourseState } from '../../../actions';

export interface LessonValues {
  id: string; kind: LessonKind; title: string; title_ha: string | null; body: string | null; body_ha: string | null; media_url: string | null;
  file_name: string | null; file_size: number | null; minutes: number | null; pass_mark: number; max_attempts: number | null; submission_types: string[]; module_id: string; peer_reviews: number;
}

const HELP = 'Blank line between paragraphs · # Heading · - list · 1. steps · **bold** · *italic* · `code` · [link](https://…)';

export function LessonForm({ slug, courseId, lesson: l, modules, skills, chosenSkills }: {
  slug: string; courseId: string; lesson: LessonValues; modules: { id: string; title: string }[];
  skills: { id: string; name: string; track: string; hub: boolean; suggested: boolean }[]; chosenSkills: string[];
}) {
  const [state, action, pending] = useActionState<CourseState, FormData>(saveLesson.bind(null, slug, courseId, l.id), {});
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'en' | 'ha'>('en');
  const e = state.errors ?? {};
  const files = LESSON_FILES[l.kind];
  const graded = l.kind === 'quiz' || l.kind === 'assignment';
  const bodyLabel = l.kind === 'assignment' ? 'Instructions' : l.kind === 'quiz' ? 'Introduction' : l.kind === 'text' ? 'Lesson text' : 'Notes for learners';

  return (
    <form onSubmit={keepValues(action)} className="space-y-6">
      {state.message && <Alert tone={state.ok ? 'teal' : 'danger'}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="ls-title" required error={e.title}><Input id="ls-title" name="title" defaultValue={l.title} maxLength={160} /></Field>
        <Field label="Title in Hausa" htmlFor="ls-title-ha" hint="Optional. Learners reading in Hausa see this."><Input id="ls-title-ha" name="title_ha" defaultValue={l.title_ha ?? ''} maxLength={160} /></Field>
        <Field label="Module" htmlFor="ls-module"><Select id="ls-module" name="module_id" defaultValue={l.module_id}>{modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</Select></Field>
        <Field label="Time to complete (minutes)" htmlFor="ls-minutes" error={e.minutes}><Input id="ls-minutes" name="minutes" inputMode="numeric" defaultValue={l.minutes ?? ''} placeholder="15" /></Field>
      </div>

      {l.kind === 'video' && (
        <Field label="YouTube or Vimeo link" htmlFor="ls-url" error={e.media_url} hint="Best for longer videos: learners can pick a lower quality to save data. Or upload a short MP4 below.">
          <Input id="ls-url" name="media_url" type="url" defaultValue={l.media_url ?? ''} placeholder="https://youtu.be/…" />
        </Field>
      )}
      {l.kind !== 'video' && <input type="hidden" name="media_url" value="" />}
      {files && (
        <DirectUpload id="ls-file" name="file" label={l.kind === 'video' ? 'Or upload a video file' : l.kind === 'audio' ? 'Audio file' : 'PDF document'} hint={files.label}
          accept={files.types} maxBytes={files.maxBytes} error={e.file} onBusy={setBusy}
          current={l.file_name ? `${l.file_name}${l.file_size ? ` (${formatBytes(l.file_size)})` : ''}` : null}
          prepare={(name, type, size) => prepareLessonUpload(slug, l.id, name, type, size)} />
      )}

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">{bodyLabel}</span>
          <div className="flex rounded-lg bg-canvas p-0.5 text-xs font-semibold" role="tablist" aria-label="Language">
            {(['en', 'ha'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={cx('rounded-md px-3 py-1', tab === t ? 'bg-white text-ink shadow-sm' : 'text-muted')}>{t === 'en' ? 'English' : 'Hausa'}</button>
            ))}
          </div>
        </div>
        <div className={tab === 'en' ? '' : 'hidden'}>
          <Textarea id="ls-body" name="body" aria-label={`${bodyLabel} in English`} rows={l.kind === 'text' ? 16 : 6} defaultValue={l.body ?? ''} className="font-mono text-[14px]" />
        </div>
        <div className={tab === 'ha' ? '' : 'hidden'}>
          <Textarea id="ls-body-ha" name="body_ha" aria-label={`${bodyLabel} in Hausa`} rows={l.kind === 'text' ? 16 : 6} defaultValue={l.body_ha ?? ''} className="font-mono text-[14px]" placeholder="Rubuta darasin cikin Hausa…" />
        </div>
        <p className="mt-1.5 text-xs text-muted">{HELP}</p>
      </div>

      {l.kind === 'quiz' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pass mark (%)" htmlFor="ls-pass" error={e.pass_mark}><Input id="ls-pass" name="pass_mark" inputMode="numeric" defaultValue={l.pass_mark} /></Field>
          <Field label="Attempts allowed" htmlFor="ls-attempts" error={e.max_attempts} hint="Blank for no limit. The best attempt counts."><Input id="ls-attempts" name="max_attempts" inputMode="numeric" defaultValue={l.max_attempts ?? ''} /></Field>
        </div>
      ) : (<><input type="hidden" name="pass_mark" value={l.pass_mark} /><input type="hidden" name="max_attempts" value={l.max_attempts ?? ''} /></>)}

      {l.kind === 'assignment' && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Learners can hand in</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            {[['text', 'Written answer'], ['link', 'A link (GitHub, Google Drive, a website)'], ['file', 'A file upload']].map(([k, label]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" name="submission_types" value={k} defaultChecked={l.submission_types.includes(k!)} className="size-4 accent-[var(--color-blue)]" />{label}</label>
            ))}
          </div>
          {e.submission_types && <p className="text-sm text-danger">{e.submission_types}</p>}
        </fieldset>
      )}

      {graded && skills.length > 0 && <SkillPicker skills={skills} chosen={chosenSkills} legend="Skills this shows" />}

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <Button type="submit" disabled={pending || busy}>{pending ? 'Saving…' : busy ? 'Uploading…' : 'Save lesson'}</Button>
        {state.ok && <span className="text-sm text-teal-700">✓ Saved</span>}
      </div>
    </form>
  );
}
