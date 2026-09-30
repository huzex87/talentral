'use client';
import { useActionState, useState, useTransition } from 'react';
import { averageMarks, criterionMax, levelFor, rubricPercent, sortLevels, type RubricCriterion } from '@talentral/domain';
import { Alert, Button, Field, Input, Textarea, cx } from '@/components/ui';
import { AiDraft, DraftText, fillField } from '@/components/ai-draft';
import { gradeSubmission, hidePeerReview, type GradeState } from './actions';
import { aiFeedback } from '../ai-actions';

export interface PeerReview { id: string; marks: Record<string, number>; comment: string | null; completed_at: string | null; hidden: boolean }

// Scores by rubric (a level per criterion, the total worked out live) or, without one, a percentage.
export function GradeForm({ slug, submissionId, name, rubric = [], ai = false, canDraft = true }: { slug: string; submissionId: string; name: string; rubric?: RubricCriterion[]; ai?: boolean; canDraft?: boolean }) {
  const [graded, grade, gPending] = useActionState<GradeState, FormData>(gradeSubmission.bind(null, slug, submissionId, 'graded'), {});
  const [sent, resubmit, rPending] = useActionState<GradeState, FormData>(gradeSubmission.bind(null, slug, submissionId, 'resubmit'), {});
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [again, setAgain] = useState(false);
  const done = graded.ok ? graded : sent.ok ? sent : null;
  if (done) return <Alert tone="teal">{done.message}</Alert>;
  const error = graded.message ?? sent.message;
  const percent = rubricPercent(rubric, marks);
  return (
    <form className="space-y-3">
      {ai && canDraft && (
        <AiDraft label="Draft feedback with AI" title="Draft feedback"
          intro={<>Claude reads the written answer and the assignment instructions{rubric.length ? ' and rubric' : ''}. It never sees the learner’s name, and it writes comments, not marks: you choose every score.</>}
          notesLabel="Your view of the work" notesPlaceholder="Short notes are enough. For example: clear idea, good local example, no costs, conclusion too short."
          controls={(
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} className="size-4 accent-[var(--color-violet)]" />They need to try again</label>
          )}
          draftLabel="Draft feedback"
          run={(notes) => aiFeedback(slug, submissionId, notes, again)}
          preview={(d) => (<>
            <DraftText text={d.feedback} />
            {d.criteria.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-[13px]">
                {rubric.map((c) => { const x = d.criteria.find((k) => k.id === c.id); return x ? <li key={c.id}><b>{c.title}:</b> {x.comment}</li> : null; })}
              </ul>
            )}
          </>)}
          useLabel="Use this feedback"
          apply={(d) => {
            fillField(`fb-${submissionId}`, d.feedback);
            for (const c of d.criteria) fillField(`nt-${submissionId}-${c.id}`, c.comment);
            return 'Feedback filled in. Edit it, choose the marks, then save.';
          }} />
      )}
      {rubric.length > 0 ? (
        <div className="space-y-3" role="group" aria-label={`Rubric for ${name}`}>
          {rubric.map((c) => (
            <fieldset key={c.id} className="rounded-xl border border-line p-3">
              <legend className="px-1 text-sm font-semibold">{c.title} <span className="font-normal text-muted">· up to {criterionMax(c.levels)}</span></legend>
              <div className="flex flex-wrap gap-1.5">
                {sortLevels(c.levels).map((l) => (
                  <label key={l.points} className="cursor-pointer">
                    <input type="radio" name={`mark_${c.id}`} value={l.points} className="peer sr-only" onChange={() => setMarks({ ...marks, [c.id]: l.points })} />
                    <span className="inline-flex rounded-lg border border-line px-2.5 py-1.5 text-sm font-semibold text-muted transition peer-checked:border-blue peer-checked:bg-blue peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-blue/40">
                      {l.label} · {l.points}
                    </span>
                  </label>
                ))}
              </div>
              <Input id={`nt-${submissionId}-${c.id}`} name={`note_${c.id}`} className="mt-2 h-9 text-sm" maxLength={600} placeholder="Comment on this criterion (optional)" aria-label={`Comment on ${c.title}`} />
            </fieldset>
          ))}
          <p className="text-sm font-semibold" aria-live="polite">Score: {percent === null ? <span className="text-muted">choose a level for each criterion</span> : <span className="text-blue">{percent}%</span>}</p>
          <Field label="Overall feedback" htmlFor={`fb-${submissionId}`}><Textarea id={`fb-${submissionId}`} name="feedback" rows={2} aria-label={`Feedback for ${name}`} placeholder="What was good, and what to improve" /></Field>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
          <Field label="Score (%)" htmlFor={`sc-${submissionId}`}><Input id={`sc-${submissionId}`} name="score" inputMode="decimal" aria-label={`Score for ${name}`} placeholder="0 to 100" /></Field>
          <Field label="Feedback" htmlFor={`fb-${submissionId}`}><Textarea id={`fb-${submissionId}`} name="feedback" rows={2} aria-label={`Feedback for ${name}`} placeholder="What was good, and what to improve" /></Field>
        </div>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" formAction={grade} disabled={gPending || rPending}>{gPending ? 'Saving…' : 'Save grade'}</Button>
        <Button type="submit" size="sm" variant="secondary" formAction={resubmit} disabled={gPending || rPending}>{rPending ? 'Sending…' : 'Ask to try again'}</Button>
      </div>
    </form>
  );
}

// Classmates' reviews of this work, for the grader. Unkind or unhelpful ones can be hidden.
export function PeerReviews({ slug, reviews, rubric }: { slug: string; reviews: PeerReview[]; rubric: RubricCriterion[] }) {
  const [pending, start] = useTransition();
  const [hidden, setHidden] = useState<Record<string, boolean>>(Object.fromEntries(reviews.map((r) => [r.id, r.hidden])));
  if (!reviews.length) return null;
  const finished = reviews.filter((r) => r.completed_at);
  const avg = averageMarks(finished.filter((r) => !hidden[r.id]));
  return (
    <details className="mt-3 rounded-xl border border-violet/20 bg-violet-50/40 p-3 text-sm">
      <summary className="cursor-pointer font-semibold text-violet">👥 Peer reviews · {finished.length} of {reviews.length} done</summary>
      {rubric.length > 0 && Object.keys(avg).length > 0 && (
        <p className="mt-2 text-xs text-muted">Classmates’ average: {rubric.map((c) => `${c.title} ${avg[c.id] ?? '–'}/${criterionMax(c.levels)}`).join(' · ')}</p>
      )}
      <ul className="mt-2 space-y-2">
        {finished.map((r, i) => (
          <li key={r.id} className={cx('rounded-lg bg-white p-3', hidden[r.id] && 'opacity-60')}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Classmate {i + 1}{hidden[r.id] ? ' · hidden from the learner' : ''}</p>
              <button type="button" disabled={pending} onClick={() => start(async () => { await hidePeerReview(slug, r.id, !hidden[r.id]); setHidden({ ...hidden, [r.id]: !hidden[r.id] }); })}
                className="text-xs font-semibold text-muted hover:text-danger">{hidden[r.id] ? 'Show to learner' : 'Hide'}</button>
            </div>
            {rubric.length > 0 && <p className="mt-1 text-xs text-muted">{rubric.map((c) => `${c.title}: ${levelFor(c, r.marks[c.id])?.label ?? '–'}`).join(' · ')}</p>}
            {r.comment && <p className="mt-1 whitespace-pre-line">{r.comment}</p>}
          </li>
        ))}
      </ul>
    </details>
  );
}
