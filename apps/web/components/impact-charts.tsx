// Plain-HTML charts for the Impact dashboard: one hue for magnitude, thin bars on a recessive
// track, a native tooltip on every bar, and a table view for each chart.
import type { Impact, ImpactSplit } from '@talentral/domain';
import { cx } from './ui';

const fmt = (n: number) => n.toLocaleString('en-NG');

export function KpiTile({ label, value, note, tone = 'ink' }: { label: string; value: string | number; note?: string; tone?: 'ink' | 'teal' | 'violet' | 'blue' }) {
  const color = { ink: 'text-ink', teal: 'text-teal-700', violet: 'text-violet', blue: 'text-blue' }[tone];
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className={cx('mt-1 font-display text-3xl font-semibold tabular-nums', color)}>{typeof value === 'number' ? fmt(value) : value}</p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  );
}

// Application to work: each stage as a share of everyone who applied, with the step conversion.
export function Funnel({ stages }: { stages: Impact['funnel'] }) {
  const top = Math.max(stages[0]?.n ?? 0, ...stages.map((s) => s.n), 1);
  return (
    <ol className="space-y-2.5" aria-label="From application to work">
      {stages.map((s, i) => {
        const prev = i ? stages[i - 1]!.n : null;
        const step = prev ? Math.round((s.n / prev) * 100) : null;
        return (
          <li key={s.stage} className="grid grid-cols-[110px_minmax(0,1fr)_88px] items-center gap-3 text-sm sm:grid-cols-[140px_minmax(0,1fr)_100px]">
            <span className="font-semibold">{s.stage}</span>
            <span className="h-3 rounded-full bg-canvas" title={`${s.stage}: ${fmt(s.n)}`}>
              <span className={cx('block h-3 rounded-full', i >= stages.length - 3 ? 'bg-teal-700' : 'bg-blue')} style={{ width: `${Math.max(s.n ? 2 : 0, (s.n / top) * 100)}%` }} />
            </span>
            <span className="text-right tabular-nums"><b>{fmt(s.n)}</b>{step !== null && <span className="ml-1.5 text-xs text-muted">{step}%</span>}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function WeeklyAttendance({ weeks, bar }: { weeks: Impact['weeks']; bar: number }) {
  if (!weeks.length) return <p className="text-sm text-muted">No sessions in the last 12 weeks.</p>;
  return (
    <div>
      <div className="relative flex h-40 items-end gap-1.5 border-b border-line pl-8" role="img" aria-label={`Weekly attendance rate for the last ${weeks.length} weeks`}>
        {[0, 50, 100].map((g) => (
          <span key={g} className="absolute left-0 w-full border-t border-dashed border-line text-[10px] text-muted" style={{ bottom: `${g}%` }}><span className="-mt-2 block w-7 bg-white">{g}%</span></span>
        ))}
        <span className="absolute left-8 right-0 border-t-2 border-amber-800/40" style={{ bottom: `${bar}%` }} title={`Attendance bar: ${bar}%`} />
        {weeks.map((w) => (
          <span key={w.week} className="relative z-10 flex-1 rounded-t-[4px] bg-blue transition hover:bg-blue-600" style={{ height: `${w.rate ?? 0}%` }}
            title={`Week of ${w.week}: ${w.rate ?? 0}% attendance across ${w.held} ${w.held === 1 ? 'session' : 'sessions'}`} />
        ))}
      </div>
      <div className="mt-1 flex gap-1.5 pl-8 text-[10px] text-muted">
        {weeks.map((w, i) => <span key={w.week} className="flex-1 truncate text-center">{i % Math.ceil(weeks.length / 6) === 0 ? w.week.slice(5) : ''}</span>)}
      </div>
      <p className="mt-2 text-xs text-muted">Present or late as a share of marked places (excused absences left out). The line is the {bar}% attendance bar.</p>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-muted">Show as a table</summary>
        <table className="mt-2 w-full text-left text-xs"><thead className="text-muted"><tr><th className="py-1">Week of</th><th className="py-1 text-right">Sessions</th><th className="py-1 text-right">Attendance</th></tr></thead>
          <tbody>{weeks.map((w) => <tr key={w.week} className="border-t border-line"><td className="py-1">{w.week}</td><td className="py-1 text-right tabular-nums">{w.held}</td><td className="py-1 text-right tabular-nums">{w.rate ?? '–'}%</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}

export function SplitTable({ rows, label }: { rows: ImpactSplit[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.enrolled));
  const share = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–');
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-[0.06em] text-muted">
          <tr><th className="py-2 pr-3">{label}</th><th className="py-2 pr-3">Enrolled</th><th className="py-2 pr-3 text-right">Completed</th><th className="py-2 pr-3 text-right">Certified</th><th className="py-2 text-right">Placed</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-2 pr-3 font-semibold">{r.key}</td>
              <td className="py-2 pr-3">
                <span className="flex items-center gap-2"><span className="h-2 w-28 rounded-full bg-canvas"><span className="block h-2 rounded-full bg-blue" style={{ width: `${(r.enrolled / max) * 100}%` }} /></span><span className="tabular-nums">{r.enrolled}</span></span>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.completed} <span className="text-xs text-muted">{share(r.completed, r.enrolled)}</span></td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.certified}</td>
              <td className="py-2 text-right tabular-nums">{r.placed} <span className="text-xs text-muted">{share(r.placed, r.completed)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">Completed shows the share of those enrolled; placed shows the share of those who completed.</p>
    </div>
  );
}
