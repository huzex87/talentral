import { scoreBand } from '@talentral/domain';
import { cx } from './ui';

const BAND = {
  none: 'bg-transparent text-muted font-normal',
  low: 'bg-danger-50 text-danger',
  mid: 'bg-amber-50 text-amber-800',
  high: 'bg-teal-50 text-teal-700',
} as const;

// A score as a coloured pill: 70% and above strong, 50 to 69% borderline, under 50% weak.
// No score yet reads as a quiet dash, with "Not scored" for screen readers.
export function ScorePill({ percent, label, className }: { percent: number | null; label?: string; className?: string }) {
  return (
    <span className={cx('inline-flex items-center rounded-md px-1.5 py-px text-[13px] font-semibold tabular-nums', BAND[scoreBand(percent)], className)}>
      {label ?? (percent === null ? <><span aria-hidden>—</span><span className="sr-only">Not scored</span></> : `${percent}%`)}
    </span>
  );
}
