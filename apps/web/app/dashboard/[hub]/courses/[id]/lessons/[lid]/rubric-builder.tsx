'use client';
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { DEFAULT_LEVELS, criterionMax, sortLevels, type RubricCriterion, type RubricLevel } from '@talentral/domain';
import { Alert, Field, Input, Select, Textarea, cx } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { keepValues } from '@/lib/keep-values';
import { deleteCriterion, moveCriterion, saveCriterion, setPeerReviews, type RubricState } from '../../../rubric-actions';

type Ids = { slug: string; courseId: string; lessonId: string };

function LevelsEditor({ initial }: { initial: RubricLevel[] }) {
  const [levels, setLevels] = useState(initial.map((l, i) => ({ ...l, key: i })));
  const [next, setNext] = useState(initial.length);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">Levels <span className="font-normal text-muted">(best first; points must differ)</span></legend>
      {levels.map((l, i) => (
        <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_80px_auto] items-center gap-2">
          <Input name="level_label" defaultValue={l.label} aria-label={`Level ${i + 1} name`} maxLength={40} required placeholder="e.g. Good" />
          <Input name="level_label_ha" defaultValue={l.label_ha ?? ''} aria-label={`Level ${i + 1} name in Hausa`} maxLength={40} placeholder="Hausa (optional)" />
          <Input name="level_points" defaultValue={String(l.points)} aria-label={`Level ${i + 1} points`} inputMode="decimal" required />
          <button type="button" onClick={() => setLevels(levels.filter((x) => x.key !== l.key))} disabled={levels.length <= 2}
            className="rounded-lg px-2 py-2 text-sm font-semibold text-muted hover:text-danger disabled:opacity-40" aria-label={`Remove level ${i + 1}`}>×</button>
        </div>
      ))}
      {levels.length < 6 && (
        <button type="button" onClick={() => { setLevels([...levels, { label: '', label_ha: '', points: 0, key: next }]); setNext(next + 1); }}
          className="text-sm font-semibold text-blue hover:underline">+ Add a level</button>
      )}
    </fieldset>
  );
}

function CriterionForm({ ids, criterion, onDone }: { ids: Ids; criterion?: RubricCriterion; onDone?: () => void }) {
  const [state, action] = useActionState<RubricState, FormData>(saveCriterion.bind(null, ids.slug, ids.courseId, ids.lessonId, criterion?.id ?? null), {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.ok) return;
    if (!criterion) ref.current?.reset();
    onDone?.();
  }, [state.ok, state.at, criterion, onDone]);
  const prefix = criterion?.id ?? 'new';
  return (
    <form ref={ref} onSubmit={keepValues(action)} className="space-y-4">
      {state.message && !state.ok && <Alert tone="danger">{state.message}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Criterion" htmlFor={`${prefix}-title`}><Input id={`${prefix}-title`} name="title" defaultValue={criterion?.title} maxLength={120} required placeholder="e.g. Page structure" /></Field>
        <Field label="Criterion in Hausa" htmlFor={`${prefix}-title-ha`}><Input id={`${prefix}-title-ha`} name="title_ha" defaultValue={criterion?.title_ha ?? ''} maxLength={120} /></Field>
        <Field label="What you look for" htmlFor={`${prefix}-desc`}><Textarea id={`${prefix}-desc`} name="description" rows={2} maxLength={600} defaultValue={criterion?.description ?? ''} placeholder="Uses headings, paragraphs and lists correctly." /></Field>
        <Field label="What you look for, in Hausa" htmlFor={`${prefix}-desc-ha`}><Textarea id={`${prefix}-desc-ha`} name="description_ha" rows={2} maxLength={600} defaultValue={criterion?.description_ha ?? ''} /></Field>
      </div>
      <LevelsEditor initial={criterion ? sortLevels(criterion.levels) : DEFAULT_LEVELS} />
      <SubmitButton size="sm" pendingLabel="Saving…">{criterion ? 'Save criterion' : 'Add criterion'}</SubmitButton>
      {state.ok && !criterion && <span role="status" className="ml-3 text-sm font-semibold text-teal-700">✓ {state.message}</span>}
    </form>
  );
}

function CriterionCard({ ids, c, index, count }: { ids: Ids; c: RubricCriterion; index: number; count: number }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  return (
    <li className="rounded-xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{index + 1}. {c.title} <span className="text-sm font-normal text-muted">· up to {criterionMax(c.levels)} points</span></p>
          {c.description && <p className="mt-0.5 text-sm text-muted">{c.description}</p>}
        </div>
        <div className="flex items-center gap-1 text-sm">
          <button type="button" disabled={pending || index === 0} onClick={() => start(() => moveCriterion(ids.slug, ids.courseId, ids.lessonId, c.id, -1))} className="rounded-lg px-2 py-1 font-semibold text-muted hover:bg-canvas disabled:opacity-30" aria-label={`Move ${c.title} up`}>↑</button>
          <button type="button" disabled={pending || index === count - 1} onClick={() => start(() => moveCriterion(ids.slug, ids.courseId, ids.lessonId, c.id, 1))} className="rounded-lg px-2 py-1 font-semibold text-muted hover:bg-canvas disabled:opacity-30" aria-label={`Move ${c.title} down`}>↓</button>
          <button type="button" onClick={() => setEditing(!editing)} className="rounded-lg px-2 py-1 font-semibold text-blue hover:bg-blue-50">{editing ? 'Close' : 'Edit'}</button>
          <button type="button" disabled={pending} onClick={() => { if (confirm(`Delete “${c.title}”? Marks already given for it are removed too.`)) start(() => deleteCriterion(ids.slug, ids.courseId, ids.lessonId, c.id)); }}
            className="rounded-lg px-2 py-1 font-semibold text-danger hover:bg-danger-50">Delete</button>
        </div>
      </div>
      {!editing && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {sortLevels(c.levels).map((l) => <li key={l.points} className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold">{l.label} · {l.points}</li>)}
        </ul>
      )}
      {editing && <div className="mt-4 border-t border-line pt-4"><CriterionForm ids={ids} criterion={c} onDone={() => setEditing(false)} /></div>}
    </li>
  );
}

export function RubricBuilder({ ids, criteria, peerReviews }: { ids: Ids; criteria: RubricCriterion[]; peerReviews: number }) {
  const [pending, start] = useTransition();
  const [peer, setPeer] = useState<RubricState | null>(null);
  const total = criteria.reduce((s, c) => s + criterionMax(c.levels), 0);
  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Marking rubric</h2>
          {criteria.length > 0 && <span className="text-sm text-muted">{criteria.length} criteria · {total} points in total</span>}
        </div>
        <p className="mt-1 text-sm text-muted">Learners see the rubric before they hand in. Graders pick a level for each criterion and the score is worked out for them. Without a rubric, graders enter a percentage.</p>
      </div>
      {criteria.length > 0 && (
        <ol className="space-y-3" aria-label="Rubric criteria">
          {criteria.map((c, i) => <CriterionCard key={c.id} ids={ids} c={c} index={i} count={criteria.length} />)}
        </ol>
      )}
      <details className={cx('rounded-xl border border-dashed border-line p-4', criteria.length === 0 && 'bg-canvas/40')} open={criteria.length === 0}>
        <summary className="cursor-pointer font-semibold text-blue">+ Add a criterion</summary>
        <div className="mt-4"><CriterionForm ids={ids} /></div>
      </details>

      <div className="border-t border-line pt-5">
        <h2 className="text-lg font-semibold">Peer review</h2>
        <p className="mt-1 text-sm text-muted">After handing in, each learner reviews classmates’ work anonymously, using the rubric and a comment. Peer reviews help learners learn from each other; they do not change the grade, and graders see them alongside the work.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label htmlFor="peer-count" className="text-sm font-semibold">Each learner reviews</label>
          <Select id="peer-count" defaultValue={String(peerReviews)} disabled={pending} className="w-auto"
            onChange={(e) => { const n = Number(e.target.value); start(async () => setPeer(await setPeerReviews(ids.slug, ids.courseId, ids.lessonId, n))); }}>
            <option value="0">no one (off)</option><option value="1">1 classmate</option><option value="2">2 classmates</option><option value="3">3 classmates</option>
          </Select>
          {peer?.message && <span role="status" className="text-sm font-semibold text-teal-700">✓ {peer.message}</span>}
        </div>
      </div>
    </div>
  );
}
