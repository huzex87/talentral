// Pilot health (Gate G2) building blocks: a card per criterion, the weekly-active trend, the NPS
// breakdown, a comparison table and comments. Plain HTML in the Impact chart style: one hue for
// magnitude, the target as a line, a native tooltip on every bar and a table view.
import { GATE_LABELS, gateStatus, type GateStatus, type NpsResult, type Rate, type WeekActive } from '@talentral/domain';
import type { HealthGroup, NpsComment } from '@/lib/health-data';
import { formatDate } from '@/lib/format';
import { Card, cx } from './ui';

const STATUS_STYLE: Record<GateStatus, { chip: string; dot: string; icon: string }> = {
  met: { chip: 'bg-teal-50 text-teal-700 border-teal-700/20', dot: 'bg-teal-700', icon: '✓' },
  near: { chip: 'bg-amber-50 text-amber-800 border-amber-800/20', dot: 'bg-amber-800', icon: '≈' },
  below: { chip: 'bg-danger-50 text-danger border-danger/20', dot: 'bg-danger', icon: '!' },
  none: { chip: 'bg-canvas text-muted border-line', dot: 'bg-line', icon: '–' },
};

export function StatusChip({ status }: { status: GateStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', s.chip)}>
      <span aria-hidden className="font-bold">{s.icon}</span>{GATE_LABELS[status]}
    </span>
  );
}

// One Gate G2 criterion: the figure, the target and how it was worked out.
export function GateCard({ label, value, unit = '%', target, status, detail }: { label: string; value: number | null; unit?: string; target: string; status: GateStatus; detail: string }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
        <StatusChip status={status} />
      </div>
      <p className="mt-2 font-display text-4xl font-semibold tabular-nums text-ink">
        {value === null ? '–' : <>{value > 0 && unit === '' ? '+' : ''}{value}<span className="text-2xl text-muted">{unit}</span></>}
      </p>
      <p className="mt-0.5 text-sm font-medium text-muted">Target {target}</p>
      <p className="mt-3 border-t border-line pt-3 text-sm text-muted">{detail}</p>
    </Card>
  );
}

export function rateDetail(r: Rate, what: string, none: string): string {
  return r.of ? `${r.count.toLocaleString('en-NG')} of ${r.of.toLocaleString('en-NG')} ${what}.` : none;
}

// Weekly active learners for the last 8 weeks, with the target as a line.
export function WeeklyTrend({ weeks, target }: { weeks: WeekActive[]; target: number }) {
  if (!weeks.some((w) => w.of)) return <p className="text-sm text-muted">No learners have started yet.</p>;
  const label = (d: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
  const last = weeks[weeks.length - 1]!;
  return (
    <div>
      <div className="relative flex h-44 items-end gap-2 border-b border-line pl-9" role="img"
        aria-label={`Weekly active learners, last ${weeks.length} weeks. This week ${last.rate ?? 0}%, target ${target}%.`}>
        {[0, 50, 100].map((g) => (
          <span key={g} className="absolute left-0 w-full border-t border-dashed border-line text-[11px] text-muted" style={{ bottom: `${g}%` }}><span className="-mt-2 block w-8 bg-white">{g}%</span></span>
        ))}
        <span className="absolute left-9 right-0 z-20 border-t-2 border-violet/60" style={{ bottom: `${target}%` }}>
          <span className="absolute -top-5 right-0 rounded bg-white px-1 text-[11px] font-semibold text-violet">Target {target}%</span>
        </span>
        {weeks.map((w, i) => (
          <span key={w.weekEnd} className={cx('relative z-10 max-w-16 flex-1 rounded-t-[4px] transition', i === weeks.length - 1 ? 'bg-blue' : 'bg-blue/45 hover:bg-blue/70')}
            style={{ height: `${Math.max(w.rate ?? 0, w.of ? 1 : 0)}%` }}
            title={`${label(w.weekStart)} to ${label(w.weekEnd)}: ${w.rate ?? 0}% (${w.count} of ${w.of} learners)`}>
            {i === weeks.length - 1 && <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-bold tabular-nums text-blue">{w.rate ?? 0}%</span>}
          </span>
        ))}
      </div>
      <div className="mt-1 flex gap-2 pl-9 text-[11px] text-muted">
        {weeks.map((w, i) => <span key={w.weekEnd} className="max-w-16 flex-1 truncate text-center">{i % 2 === 1 || i === weeks.length - 1 ? label(w.weekEnd) : ''}</span>)}
      </div>
      <p className="mt-2 text-xs text-muted">Learners who did anything on Talentral in each 7-day window, among those who had started and not dropped out. The darker bar is the last 7 days.</p>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-muted">Show as a table</summary>
        <table className="mt-2 w-full text-left text-xs">
          <thead className="text-muted"><tr><th className="py-1">Week</th><th className="py-1 text-right">Active</th><th className="py-1 text-right">Learners</th><th className="py-1 text-right">Share</th></tr></thead>
          <tbody>{weeks.map((w) => <tr key={w.weekEnd} className="border-t border-line"><td className="py-1">{label(w.weekStart)} to {label(w.weekEnd)}</td><td className="py-1 text-right tabular-nums">{w.count}</td><td className="py-1 text-right tabular-nums">{w.of}</td><td className="py-1 text-right tabular-nums">{w.rate ?? '–'}%</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}

// Promoters, passives and detractors as one stacked bar, with the score and counts.
export function NpsBreakdown({ title, result, target }: { title: string; result: NpsResult; target: number }) {
  const status = gateStatus(result.score, target);
  const parts = [
    { key: 'Promoters (9 to 10)', n: result.promoters, color: 'bg-teal-700' },
    { key: 'Passives (7 to 8)', n: result.passives, color: 'bg-line' },
    { key: 'Detractors (0 to 6)', n: result.detractors, color: 'bg-danger' },
  ];
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <StatusChip status={status} />
      </div>
      <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{result.score === null ? '–' : `${result.score > 0 ? '+' : ''}${result.score}`}
        <span className="ml-2 text-sm font-medium text-muted">{result.responses} {result.responses === 1 ? 'answer' : 'answers'}</span></p>
      {result.responses > 0 && (
        <>
          <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.key}: ${p.n}`).join(', ')}>
            {parts.filter((p) => p.n).map((p) => <span key={p.key} className={p.color} style={{ width: `${(p.n / result.responses) * 100}%` }} title={`${p.key}: ${p.n}`} />)}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {parts.map((p) => <li key={p.key} className="flex items-center gap-1.5"><span aria-hidden className={cx('size-2.5 rounded-sm', p.color)} />{p.key}: <b className="text-ink tabular-nums">{p.n}</b></li>)}
          </ul>
        </>
      )}
    </div>
  );
}

function Cell({ r, target }: { r: Rate; target: number }) {
  const status = gateStatus(r.rate, target);
  return (
    <td className="px-3 py-2.5 text-right tabular-nums" title={r.of ? `${r.count} of ${r.of}` : 'No data yet'}>
      <span className="inline-flex items-center gap-1.5">{r.rate === null ? <span className="text-muted">–</span> : `${r.rate}%`}
        <span aria-label={GATE_LABELS[status]} role="img" className={cx('size-2 rounded-full', STATUS_STYLE[status].dot)} /></span>
    </td>
  );
}

function NpsCell({ r, target }: { r: NpsResult; target: number }) {
  const status = gateStatus(r.score, target);
  return (
    <td className="px-3 py-2.5 text-right tabular-nums" title={`${r.responses} ${r.responses === 1 ? 'answer' : 'answers'}`}>
      <span className="inline-flex items-center gap-1.5">{r.score === null ? <span className="text-muted">–</span> : `${r.score > 0 ? '+' : ''}${r.score}`}
        <span aria-label={GATE_LABELS[status]} role="img" className={cx('size-2 rounded-full', STATUS_STYLE[status].dot)} /></span>
    </td>
  );
}

// Each cohort (hub view) or hub (platform view) against the targets.
export function HealthTable({ groups, label, targets, staff }: { groups: HealthGroup[]; label: string; targets: { activation: number; weeklyActive: number; attendance: number; nps: number }; staff: boolean }) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`Pilot health by ${label.toLowerCase()}`}>
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-[0.06em] text-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">{label}</th>
            <th className="px-3 py-2 text-right font-semibold">Learners</th>
            <th className="px-3 py-2 text-right font-semibold">Activation</th>
            <th className="px-3 py-2 text-right font-semibold">Weekly active</th>
            <th className="px-3 py-2 text-right font-semibold">Attendance</th>
            <th className="px-3 py-2 text-right font-semibold">Learner NPS</th>
            {staff && <th className="px-3 py-2 text-right font-semibold">Staff NPS</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {groups.map((g) => (
            <tr key={g.id}>
              <th scope="row" className="max-w-64 truncate px-3 py-2.5 font-semibold">{g.name}</th>
              <td className="px-3 py-2.5 text-right tabular-nums">{g.learners.toLocaleString('en-NG')}</td>
              <Cell r={g.activation} target={targets.activation} />
              <Cell r={g.weeklyActive} target={targets.weeklyActive} />
              <Cell r={g.attendance} target={targets.attendance} />
              <NpsCell r={g.npsLearners} target={targets.nps} />
              {staff && <NpsCell r={g.npsStaff ?? { score: null, responses: 0, promoters: 0, passives: 0, detractors: 0 }} target={targets.nps} />}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NpsComments({ comments, showHub }: { comments: NpsComment[]; showHub: boolean }) {
  if (!comments.length) return <p className="text-sm text-muted">No comments yet. People can add one when they answer.</p>;
  const tone = (s: number) => (s >= 9 ? 'bg-teal-50 text-teal-700' : s >= 7 ? 'bg-canvas text-muted' : 'bg-danger-50 text-danger');
  return (
    <ul className="divide-y divide-line">
      {comments.map((c, i) => (
        <li key={i} className="flex gap-3 py-3">
          <span className={cx('grid size-9 shrink-0 place-items-center rounded-lg text-sm font-bold tabular-nums', tone(c.score))} aria-label={`Score ${c.score}`}>{c.score}</span>
          <div className="min-w-0">
            <p className="text-[15px] leading-relaxed">{c.comment}</p>
            <p className="mt-0.5 text-xs text-muted">{c.audience === 'learner' ? 'Learner' : 'Staff'}{showHub && c.hub ? ` · ${c.hub}` : ''}{c.cohort ? ` · ${c.cohort}` : ''} · {formatDate(c.created_at)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
