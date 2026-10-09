// The one weekly bar chart every dashboard uses: recessive gridlines, muted bars, the latest bar
// in full blue with its value, an optional labelled target line, a tooltip on every bar and a
// table view. Percent scale (0 to 100) only, so bars from different screens compare at a glance.
import { cx } from './ui';

export type TrendBar = { key: string; tick: string; value: number | null; tip: string };

export function TrendBars({ bars, target, targetLabel, label, height = 'h-44', tickEvery }: {
  bars: TrendBar[]; target?: number | null; targetLabel?: string; label: string; height?: string; tickEvery?: number;
}) {
  const last = bars.length - 1;
  const every = tickEvery ?? Math.max(1, Math.ceil(bars.length / 6));
  return (
    <figure>
      <div className={cx('relative flex items-end gap-1.5 border-b border-line pl-9 pt-6 sm:gap-2', height)} role="img" aria-label={label}>
        {[0, 50, 100].map((g) => (
          <span key={g} aria-hidden className="absolute left-0 right-0 border-t border-dashed border-line text-[11px] text-subtle" style={{ bottom: `calc((100% - 1.5rem) * ${g / 100})` }}>
            <span className="-mt-2 block w-8 bg-white tabular-nums">{g}%</span>
          </span>
        ))}
        {target != null && (
          <span aria-hidden className="absolute left-9 right-0 z-20 border-t-2 border-violet/60" style={{ bottom: `calc((100% - 1.5rem) * ${target / 100})` }}>
            <span className="absolute -top-5 right-0 rounded bg-white px-1 text-[11px] font-semibold text-violet">{targetLabel ?? `Target ${target}%`}</span>
          </span>
        )}
        {bars.map((b, i) => (
          <span key={b.key} className="group relative z-10 flex h-full max-w-16 min-w-0 flex-1 flex-col justify-end">
            <span className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-white opacity-0 shadow-[var(--shadow-pop)] transition-opacity group-hover:opacity-100">{b.tip}</span>
            <span className={cx('relative block w-full rounded-t-[4px] transition-colors', i === last ? 'bg-blue' : 'bg-blue/40 group-hover:bg-blue/65')}
              style={{ height: `${Math.max(b.value ?? 0, b.value ? 1.5 : 0)}%` }}>
              {i === last && <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-bold tabular-nums text-blue-600">{b.value ?? 0}%</span>}
            </span>
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 pl-9 text-[11px] text-subtle sm:gap-2" aria-hidden>
        {bars.map((b, i) => <span key={b.key} className="max-w-16 min-w-0 flex-1 truncate text-center">{(last - i) % every === 0 ? b.tick : ''}</span>)}
      </div>
    </figure>
  );
}
