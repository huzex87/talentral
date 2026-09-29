import { scoreBand } from '@talentral/domain';
import { cx } from './ui';

const BAND = {
  none: 'bg-canvas text-muted',
  low: 'bg-danger-50 text-danger',
  mid: 'bg-amber-50 text-amber-800',
  high: 'bg-teal-50 text-teal-700',
} as const;

// A score as a coloured pill: 70% and above strong, 50 to 69% borderline, under 50% weak.
export function ScorePill({ percent, label, className }: { percent: number | null; label?: string; className?: string }) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-bold tabular-nums', BAND[scoreBand(percent)], className)}>
      {label ?? (percent === null ? 'Not scored' : `${percent}%`)}
    </span>
  );
}
