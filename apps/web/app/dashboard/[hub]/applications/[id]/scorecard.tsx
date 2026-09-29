'use client';
import { useActionState, useState } from 'react';
import { scorePercent, type Criterion, type Scores } from '@talentral/domain';
import { Alert, Card, Textarea, cx } from '@/components/ui';
import { ScorePill } from '@/components/score-pill';
import { SubmitButton } from '@/components/submit-button';
import { saveScore, type ScoreState } from './actions';

// The signed-in reviewer's scoresheet. Scores are tap targets rather than sliders so they are
// quick and exact on a phone; the running percentage shows before saving.
export function Scorecard({ slug, applicationId, rubric, mine, comment }: {
  slug: string; applicationId: string; rubric: Criterion[]; mine: Scores | null; comment: string | null;
}) {
  const [state, action] = useActionState<ScoreState, FormData>(saveScore.bind(null, slug, applicationId), {});
  const [scores, setScores] = useState<Partial<Scores>>(mine ?? {});
  const complete = rubric.every((c) => typeof scores[c.id] === 'number');
  const percent = complete ? scorePercent(rubric, scores as Scores) : null;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{mine ? 'Your score' : 'Score this application'}</h2>
        <ScorePill percent={percent} label={percent === null ? `${Object.keys(scores).length} of ${rubric.length} scored` : undefined} />
      </div>
      <p className="mt-1 text-sm text-muted">Your scores are visible to your hub team. Each reviewer scores independently; the list shows the average.</p>

      <form action={action} className="mt-5 space-y-5">
        {rubric.map((c) => (
          <fieldset key={c.id}>
            <legend className="text-[15px] font-semibold">{c.label}{c.weight > 1 && <span className="ml-2 text-xs font-bold text-violet">×{c.weight}</span>}</legend>
            {c.help && <p className="text-[13px] text-muted">{c.help}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={c.label}>
              {Array.from({ length: c.max + 1 }, (_, n) => {
                const on = scores[c.id] === n;
                return (
                  <label key={n} className={cx('flex h-10 min-w-10 cursor-pointer items-center justify-center rounded-lg border px-2 text-sm font-semibold transition',
                    on ? 'border-blue bg-blue text-white' : 'border-line bg-white text-ink hover:border-blue/50')}>
                    <input type="radio" name={`score.${c.id}`} value={n} checked={on} onChange={() => setScores((s) => ({ ...s, [c.id]: n }))} className="sr-only" aria-label={`${c.label}: ${n} of ${c.max}`} />
                    {n}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        <label className="block space-y-1.5"><span className="text-sm font-semibold">Comment <span className="font-normal text-muted">(optional)</span></span>
          <Textarea name="comment" rows={2} maxLength={1000} defaultValue={comment ?? ''} placeholder="Why this score? Useful when the team compares notes." /></label>
        {state.message && <Alert tone={state.ok ? 'teal' : 'danger'}>{state.message}</Alert>}
        <SubmitButton size="sm" disabled={!complete} pendingLabel="Saving…">{mine ? 'Update score' : 'Save score'}</SubmitButton>
      </form>
    </Card>
  );
}
