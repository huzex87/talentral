// Small, dependency-free charts for dashboards. One blue hue for amounts, teal for verified
// outcomes, thin marks, labels in text colours, and a text alternative for screen readers.
import type { ReactNode } from 'react';
import { Card, cx } from '@/components/ui';

export function KpiTile({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: 'blue' | 'teal' }) {
  return (
    <div className="relative min-w-0 bg-white p-5">
      <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
        {accent && <span aria-hidden className={cx('size-1.5 rounded-full', accent === 'teal' ? 'bg-teal-700' : 'bg-blue')} />}{label}
      </p>
      <p className="mt-2.5 text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">{value}</p>
      {hint && <div className="mt-2 truncate text-[13px] text-muted">{hint}</div>}
    </div>
  );
}

// The skills-to-work journey: each stage's count, its share of applicants and the step from the
// stage before.
export function JourneyFunnel({ stages }: { stages: { stage: string; n: number }[] }) {
  const top = Math.max(stages[0]?.n ?? 0, 1);
  return (
    <ol className="space-y-3">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1]!.n : null;
        const step = prev ? Math.round((s.n / prev) * 100) : null;
        const outcome = i >= stages.length - 1;
        return (
          <li key={s.stage} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
            <span className="truncate text-ink-2">{s.stage}</span>
            <div className="h-2 rounded-full bg-hover" aria-hidden>
              <div className={cx('h-2 rounded-full', outcome ? 'bg-teal-700' : 'bg-blue')} style={{ width: `${Math.max(1.5, (s.n / top) * 100)}%` }} />
            </div>
            <span className="w-24 text-right tabular-nums">
              <span className="font-semibold text-ink">{s.n.toLocaleString('en-NG')}</span>
              {step !== null && <span className="ml-1.5 text-xs text-muted">{step}%</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// Weekly attendance as columns, with the rate on hover and in the accessible description.
export function AttendanceColumns({ weeks }: { weeks: { week: string; held: number; rate: number | null }[] }) {
  const label = (w: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${w}T12:00:00Z`));
  if (!weeks.length) return <p className="py-10 text-center text-sm text-muted">Attendance appears here once classes are held.</p>;
  return (
    <figure>
      <div className="flex h-44 items-end gap-1.5 sm:gap-2" role="img"
        aria-label={`Weekly attendance: ${weeks.map((w) => `week of ${label(w.week)} ${w.rate ?? 0}%`).join(', ')}`}>
        {weeks.map((w) => (
          <div key={w.week} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
            <span className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-white opacity-0 shadow-[var(--shadow-pop)] transition-opacity group-hover:opacity-100">
              {label(w.week)}: {w.rate ?? 0}% · {w.held} {w.held === 1 ? 'class' : 'classes'}
            </span>
            <div className="w-full rounded-t-[4px] bg-blue transition-colors group-hover:bg-blue-600" style={{ height: `${Math.max(2, w.rate ?? 0)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between border-t border-line pt-2 text-xs text-muted" aria-hidden>
        <span>{label(weeks[0]!.week)}</span><span>{label(weeks[weeks.length - 1]!.week)}</span>
      </div>
    </figure>
  );
}

// Readiness levels as one stacked bar (light to dark: further along is darker) with a legend.
export function ReadinessBar({ levels }: { levels: { level: string; label: string; n: number }[] }) {
  const total = levels.reduce((s, l) => s + l.n, 0);
  const shade = ['#D9E2FF', '#9DB3FF', '#5B7FFF', '#2E5BFF', '#1A3FCC'];
  if (!total) return <p className="py-6 text-sm text-muted">Readiness appears once learners enrol.</p>;
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={levels.map((l) => `${l.label}: ${l.n}`).join(', ')}>
        {levels.filter((l) => l.n > 0).map((l) => (
          <div key={l.level} style={{ width: `${(l.n / total) * 100}%`, background: shade[levels.indexOf(l)] }} />
        ))}
      </div>
      <ul className="mt-4 space-y-2.5 text-sm">
        {levels.map((l, i) => (
          <li key={l.level} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-ink-2"><span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: shade[i] }} /><span className="truncate">{l.label}</span></span>
            <span className="tabular-nums"><span className="font-medium text-ink">{l.n}</span><span className="ml-2 inline-block w-9 text-right text-xs text-muted">{Math.round((l.n / total) * 100)}%</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A breakdown of counts on thin recessive tracks.
export function Breakdown({ title, rows, total }: { title: string; rows: { key: string | null; n: number }[]; total: number }) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {rows.length === 0 ? <p className="mt-4 text-sm text-muted">No data yet.</p> : (
        <ul className="mt-4 space-y-3.5">
          {rows.map((r) => {
            const share = Math.round((r.n / Math.max(total, 1)) * 100);
            return (
              <li key={r.key ?? 'none'}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-ink-2">{r.key ?? 'Not stated'}</span>
                  <span className="shrink-0 tabular-nums"><span className="font-medium text-ink">{r.n.toLocaleString('en-NG')}</span><span className="ml-2 inline-block w-9 text-right text-xs text-muted">{share}%</span></span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-hover"><div className="h-1.5 rounded-full bg-blue" style={{ width: `${Math.max(2, share)}%` }} /></div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function Meter({ value, tone = 'blue' }: { value: number | null; tone?: 'blue' | 'teal' }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-hover" aria-hidden>
      <div className={cx('h-1.5 rounded-full', tone === 'teal' ? 'bg-teal-700' : 'bg-blue')} style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
    </div>
  );
}
