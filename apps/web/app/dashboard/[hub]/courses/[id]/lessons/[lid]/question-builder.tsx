'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { QUESTION_KINDS, type QuestionKind, type QuizOption } from '@talentral/domain';
import { Alert, Button, Field, Input, Select, Textarea, cx } from '@/components/ui';
import { deleteQuestion, moveQuestion, saveQuestion } from '../../../actions';

export interface QuestionValues { id: string; kind: QuestionKind; prompt: string; prompt_ha: string | null; options: QuizOption[]; correct: string[]; points: number; explanation: string | null }

const LETTERS = 'abcdefgh';
const blank = (): Omit<QuestionValues, 'id'> => ({ kind: 'single', prompt: '', prompt_ha: '', options: [{ id: 'a', text: '' }, { id: 'b', text: '' }], correct: [], points: 1, explanation: '' });

function Editor({ slug, courseId, lessonId, initial, onDone }: { slug: string; courseId: string; lessonId: string; initial: QuestionValues | null; onDone: () => void }) {
  const [q, setQ] = useState<Omit<QuestionValues, 'id'>>(initial ?? blank());
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const options = q.kind === 'true_false' ? [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }] : q.options;
  const toggle = (id: string) => setQ({ ...q, correct: q.kind === 'multiple' ? (q.correct.includes(id) ? q.correct.filter((c) => c !== id) : [...q.correct, id]) : [id] });
  const key = initial?.id ?? 'new';
  return (
    <div className="space-y-4 rounded-2xl border border-blue/25 bg-blue-50/30 p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_100px]">
        <Field label="Question" htmlFor={`qp-${key}`}><Textarea id={`qp-${key}`} rows={2} value={q.prompt} onChange={(e) => setQ({ ...q, prompt: e.target.value })} /></Field>
        <Field label="Type" htmlFor={`qk-${key}`}>
          <Select id={`qk-${key}`} value={q.kind} onChange={(e) => setQ({ ...q, kind: e.target.value as QuestionKind, correct: [] })}>{Object.entries(QUESTION_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        </Field>
        <Field label="Points" htmlFor={`qn-${key}`}><Input id={`qn-${key}`} inputMode="numeric" value={q.points} onChange={(e) => setQ({ ...q, points: Number(e.target.value.replace(/\D/g, '')) || 1 })} /></Field>
      </div>
      <Field label="Question in Hausa (optional)" htmlFor={`qh-${key}`}><Input id={`qh-${key}`} value={q.prompt_ha ?? ''} onChange={(e) => setQ({ ...q, prompt_ha: e.target.value })} /></Field>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Answers <span className="font-normal text-muted">({q.kind === 'multiple' ? 'tick every right answer' : 'choose the right answer'})</span></legend>
        {options.map((o, i) => (
          <div key={o.id} className="grid items-center gap-2 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type={q.kind === 'multiple' ? 'checkbox' : 'radio'} name={`correct-${key}`} checked={q.correct.includes(o.id)} onChange={() => toggle(o.id)} className="size-4 accent-[var(--color-teal-700)]" aria-label={`Answer ${i + 1} is right`} />
              <span className="w-5 text-muted">{q.kind === 'true_false' ? '' : `${o.id.toUpperCase()}.`}</span>
            </label>
            {q.kind === 'true_false' ? <span className="text-sm font-semibold">{o.text}</span> : <>
              <Input aria-label={`Answer ${i + 1}`} value={o.text} onChange={(e) => setQ({ ...q, options: q.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })} />
              <Input aria-label={`Answer ${i + 1} in Hausa`} placeholder="Hausa (optional)" value={o.text_ha ?? ''} onChange={(e) => setQ({ ...q, options: q.options.map((x) => (x.id === o.id ? { ...x, text_ha: e.target.value } : x)) })} />
              <Button type="button" variant="ghost" size="sm" disabled={q.options.length <= 2} onClick={() => setQ({ ...q, options: q.options.filter((x) => x.id !== o.id), correct: q.correct.filter((c) => c !== o.id) })} aria-label={`Remove answer ${i + 1}`}>✕</Button>
            </>}
          </div>
        ))}
        {q.kind !== 'true_false' && q.options.length < 8 && (
          <button type="button" className="text-sm font-semibold text-blue hover:underline" onClick={() => setQ({ ...q, options: [...q.options, { id: LETTERS.split('').find((l) => !q.options.some((o) => o.id === l))!, text: '' }] })}>+ Add an answer</button>
        )}
      </fieldset>
      <Field label="Explanation shown after answering (optional)" htmlFor={`qe-${key}`}><Input id={`qe-${key}`} value={q.explanation ?? ''} onChange={(e) => setQ({ ...q, explanation: e.target.value })} /></Field>
      {message && <Alert tone="danger">{message}</Alert>}
      <div className="flex gap-2">
        <Button type="button" disabled={pending} onClick={() => start(async () => {
          const r = await saveQuestion(slug, courseId, lessonId, initial?.id ?? null, { ...q, options });
          if (!r.ok) { setMessage(r.message ?? 'Could not save.'); return; }
          setMessage(null); onDone(); router.refresh();
        })}>{pending ? 'Saving…' : initial ? 'Save question' : 'Add question'}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

export function QuestionBuilder({ slug, courseId, lessonId, questions }: { slug: string; courseId: string; lessonId: string; questions: QuestionValues[] }) {
  const [editing, setEditing] = useState<string | null>(questions.length ? null : 'new');
  const [pending, start] = useTransition();
  const router = useRouter();
  const total = questions.reduce((s, q) => s + q.points, 0);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{questions.length} {questions.length === 1 ? 'question' : 'questions'} · {total} points. Marked automatically; learners never see the answers until they have answered.</p>
      <ol className="space-y-3" aria-label="Questions">
        {questions.map((q, i) => editing === q.id ? (
          <li key={q.id}><Editor slug={slug} courseId={courseId} lessonId={lessonId} initial={q} onDone={() => setEditing(null)} /></li>
        ) : (
          <li key={q.id} className="rounded-2xl border border-line bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{i + 1}. {q.prompt}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {q.options.map((o) => <li key={o.id} className={cx('flex gap-2', q.correct.includes(o.id) ? 'font-semibold text-teal-700' : 'text-muted')}><span aria-hidden>{q.correct.includes(o.id) ? '✓' : '○'}</span>{o.text}</li>)}
                </ul>
                <p className="mt-2 text-xs text-muted">{QUESTION_KINDS[q.kind]} · {q.points} {q.points === 1 ? 'point' : 'points'}{q.prompt_ha ? ' · Hausa ✓' : ''}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(q.id)}>Edit</Button>
                <div className="flex">
                  <Button type="button" size="sm" variant="ghost" disabled={pending || i === 0} aria-label={`Move question ${i + 1} up`} onClick={() => start(async () => { await moveQuestion(slug, courseId, lessonId, q.id, -1); router.refresh(); })}>↑</Button>
                  <Button type="button" size="sm" variant="ghost" disabled={pending || i === questions.length - 1} aria-label={`Move question ${i + 1} down`} onClick={() => start(async () => { await moveQuestion(slug, courseId, lessonId, q.id, 1); router.refresh(); })}>↓</Button>
                  <Button type="button" size="sm" variant="ghost" className="text-danger" disabled={pending} aria-label={`Delete question ${i + 1}`} onClick={() => { if (confirm('Delete this question?')) start(async () => { await deleteQuestion(slug, courseId, lessonId, q.id); router.refresh(); }); }}>✕</Button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {editing === 'new' ? <Editor slug={slug} courseId={courseId} lessonId={lessonId} initial={null} onDone={() => setEditing(null)} />
        : <Button type="button" variant="secondary" onClick={() => setEditing('new')}>Add a question</Button>}
    </div>
  );
}
