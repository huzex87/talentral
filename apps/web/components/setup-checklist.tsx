// "Getting started" for a new hub: the six steps from an empty account to a running cohort.
// Each step links to the screen that does it; finished steps tick off, and the card leaves the
// overview once every step is done.
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { Card, cx } from './ui';

export type SetupStep = { key: string; title: string; detail: string; href: string; done: boolean };

export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done);
  const pct = Math.round((done / steps.length) * 100);
  return (
    <Card className="overflow-hidden" role="region" aria-labelledby="setup">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-[linear-gradient(120deg,#EEF2FF_0%,#FFFFFF_60%)] px-5 py-4 sm:px-6">
        <div>
          <h2 id="setup" className="font-display text-lg font-semibold">Get your hub ready</h2>
          <p className="text-sm text-muted">{done} of {steps.length} done. Next: {next?.title.toLowerCase()}.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-36 rounded-full bg-white ring-1 ring-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress">
            <div className="h-2 rounded-full bg-blue" style={{ width: `${Math.max(pct, 4)}%` }} />
          </div>
          <span className="font-display text-sm font-semibold tabular-nums text-ink">{pct}%</span>
        </div>
      </div>
      <ol className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.key} className="bg-white">
            <Link href={s.href} className={cx('group flex h-full gap-3 px-5 py-4 transition-colors hover:bg-canvas/60 sm:px-6', s === next && 'bg-blue-50/50')}>
              <span aria-hidden className={cx('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold',
                s.done ? 'border-teal-700 bg-teal-700 text-white' : s === next ? 'border-blue bg-white text-blue-600' : 'border-line-strong bg-white text-muted')}>
                {s.done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cx('flex items-center gap-1 text-sm font-medium', s.done ? 'text-muted line-through decoration-mist' : 'text-ink group-hover:text-blue')}>
                  {s.title}{!s.done && <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-muted">{s.done ? 'Done' : s.detail}</span>
                <span className="sr-only">{s.done ? ' (done)' : ' (to do)'}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
