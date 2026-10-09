'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { scorePercent, type Criterion, type Scores } from '@talentral/domain';
import { Alert, Card, Textarea, cx } from '@/components/ui';
import { ScorePill } from '@/components/score-pill';
import { SubmitButton } from '@/components/submit-button';
import { saveScore, type ScoreState } from './actions';

// The signed-in reviewer's scoresheet. Scores are tap targets rather than sliders so they are
// quick and exact on a phone; the running percentage shows before saving.
// In review mode a digit key scores the next criterion without a score (or the one in focus),
// and Ctrl+Enter saves and moves to the next application.
export function Scorecard({ slug, applicationId, rubric, mine, comment, nextHref }: {
  slug: string; applicationId: string; rubric: Criterion[]; mine: Scores | null; comment: string | null; nextHref?: string | null;
}) {
  const [state, action] = useActionState<ScoreState, FormData>(saveScore.bind(null, slug, applicationId), {});
  const [scores, setScores] = useState<Partial<Scores>>(mine ?? {});
  const [active, setActive] = useState(() => Math.max(0, rubric.findIndex((c) => typeof mine?.[c.id] !== 'number')));
  const form = useRef<HTMLFormElement>(null);
  const advance = useRef(false);
  const router = useRouter();
  const complete = rubric.every((c) => typeof scores[c.id] === 'number');
  const percent = complete ? scorePercent(rubric, scores as Scores) : null;

  useEffect(() => { if (state.ok && advance.current && nextHref) router.push(nextHref); advance.current = false; }, [state, nextHref, router]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && complete) { e.preventDefault(); advance.current = Boolean(nextHref); form.current?.requestSubmit(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && (t as HTMLInputElement).type !== 'radio'))) return;
      if (!/^[0-9]$/.test(e.key)) return;
      const c = rubric[active];
      const n = Number(e.key);
      if (!c || n > c.max) return;
      e.preventDefault();
      setScores((s) => ({ ...s, [c.id]: n }));
      setActive((i) => Math.min(rubric.length - 1, i + 1));
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [active, complete, nextHref, rubric]);

  return (
    <Card id="score" className="scroll-mt-20 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{mine ? 'Your score' : 'Score this application'}</h2>
        <ScorePill percent={percent} label={percent === null ? `${Object.keys(scores).length} of ${rubric.length} scored` : undefined} />
      </div>
      <p className="mt-1 text-[13px] text-muted">Visible to your hub team. Each reviewer scores on their own; the list shows the average.</p>

      <form ref={form} action={action} className="mt-4 space-y-4">
        {rubric.map((c, i) => (
          <fieldset key={c.id} onFocus={() => setActive(i)} className={cx('-mx-2 rounded-lg px-2 py-1 transition-colors', i === active && 'bg-blue-50/50')}>
            <legend className="text-sm font-semibold">{c.label}{c.weight > 1 && <span className="ml-2 text-xs font-bold text-violet">×{c.weight}</span>}</legend>
            {c.help && <p className="text-[13px] text-muted">{c.help}</p>}
            <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label={c.label}>
              {Array.from({ length: c.max + 1 }, (_, n) => {
                const on = scores[c.id] === n;
                return (
                  <label key={n} className={cx('relative flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg border px-2 text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue/40',
                    on ? 'border-blue bg-blue text-white' : 'border-line bg-white text-ink hover:border-blue/50')}>
                    <input type="radio" name={`score.${c.id}`} value={n} checked={on} onChange={() => setScores((s) => ({ ...s, [c.id]: n }))} className="absolute inset-0 size-full scroll-my-28 cursor-pointer appearance-none rounded-lg opacity-0" aria-label={`${c.label}: ${n} of ${c.max}`} />
                    {n}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        <label className="block space-y-1.5"><span className="text-sm font-semibold">Comment <span className="font-normal text-muted">(optional)</span></span>
          <Textarea name="comment" rows={2} className="min-h-16" maxLength={1000} defaultValue={comment ?? ''} placeholder="Why this score? Useful when the team compares notes." /></label>
        {state.message && <Alert tone={state.ok ? 'teal' : 'danger'}>{state.message}</Alert>}
        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton size="sm" disabled={!complete} pendingLabel="Saving…" variant={nextHref ? 'secondary' : 'primary'}>{mine ? 'Update score' : 'Save score'}</SubmitButton>
          {nextHref && <SubmitButton size="sm" disabled={!complete} pendingLabel="Saving…" onClick={() => { advance.current = true; }}>Save and next</SubmitButton>}
          <span className="hidden w-full text-xs text-muted md:block">Keys: digits score, Ctrl + Enter saves and moves on</span>
        </div>
      </form>
    </Card>
  );
}
