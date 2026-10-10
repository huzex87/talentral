import { Activity } from 'lucide-react';
// The body of both engagement pages: the Gate G2 criteria, the weekly trend, NPS and the
// comparison table. The platform page adds the incident log; the hub page shows its cohorts.
import type { ReactNode } from 'react';
import { G2, GATE_LABELS, gateStatus } from '@talentral/domain';
import type { HealthReport } from '@/lib/health-data';
import { NPS_WINDOW_DAYS } from '@/lib/health-data';
import { GateCard, HealthTable, NpsBreakdown, NpsComments, WeeklyTrend, rateDetail } from './health';
import { Card, EmptyState } from './ui';

export function HealthView({ report, scope, incidentsCard }: { report: HealthReport; scope: 'platform' | 'hub'; incidentsCard?: ReactNode }) {
  const week = report.weekly[report.weekly.length - 1]!;
  const combined = combinedNps(report);
  const criteria = [
    { key: 'Activation', status: gateStatus(report.activation.rate, G2.activation) },
    { key: 'Weekly active', status: gateStatus(week.rate, G2.weeklyActive) },
    { key: 'Attendance', status: gateStatus(report.attendance.rate, G2.attendance) },
    { key: 'Learner NPS', status: gateStatus(report.nps.learner.score, G2.nps) },
    { key: 'Staff NPS', status: gateStatus(report.nps.staff.score, G2.nps) },
    ...(scope === 'platform' ? [{ key: 'Cross-tenant incidents', status: gateStatus(report.crossTenantIncidents, G2.crossTenantIncidents, true) }] : []),
  ];
  const met = criteria.filter((c) => c.status === 'met').length;
  const measured = criteria.filter((c) => c.status !== 'none').length;

  if (!report.learners && !report.nps.learner.responses && !report.nps.staff.responses && scope === 'hub') {
    return <EmptyState icon={Activity} title="No learners yet">Engagement appears once learners are enrolled in a cohort. Activation, weekly use, attendance and NPS are measured from their first day.</EmptyState>;
  }

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4 border-midnight bg-midnight! p-5 text-white sm:p-6">
        <div>
          <p className="text-[13px] font-medium text-teal">{scope === 'platform' ? 'Gate G2 · Engagement' : 'Engagement targets'}</p>
          <p className="mt-1 font-display text-2xl font-semibold">{measured ? `${met} of ${criteria.length} criteria on target` : 'Waiting for the first learners'}</p>
          <p className="mt-0.5 text-sm text-white/70">{report.learners.toLocaleString('en-NG')} {report.learners === 1 ? 'learner' : 'learners'} · combined NPS {combined === null ? 'not yet measured' : `${combined > 0 ? '+' : ''}${combined}`} · figures as of today ({report.today}), West Africa Time</p>
        </div>
        <ul className="flex gap-1.5" aria-hidden>
          {criteria.map((c) => (
            <li key={c.key} className={`h-2.5 w-7 rounded-full ${c.status === 'met' ? 'bg-teal' : c.status === 'near' ? 'bg-amber-50' : c.status === 'below' ? 'bg-danger-50' : 'bg-white/20'}`} title={`${c.key}: ${GATE_LABELS[c.status]}`} />
          ))}
        </ul>
      </Card>

      <section aria-labelledby="g2-criteria" className="space-y-3">
        <h2 id="g2-criteria" className="sr-only">Gate G2 criteria</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <GateCard label="Activation within 7 days" value={report.activation.rate} target={`${G2.activation}% or more`} status={criteria[0]!.status}
            detail={rateDetail(report.activation, 'learners did something on Talentral within a week of starting', 'Measured once learners have been in for 7 days.')} />
          <GateCard label="Weekly active" value={week.rate} target={`${G2.weeklyActive}% or more`} status={criteria[1]!.status}
            detail={rateDetail(week, 'learners were active in the last 7 days', 'Measured once learners have started.')} />
          <GateCard label="Attendance" value={report.attendance.rate} target={`${G2.attendance}% or more`} status={criteria[2]!.status}
            detail={rateDetail(report.attendance, 'marked places were present or late (excused left out)', 'Measured once registers are marked.')} />
          <GateCard label="Learner NPS" value={report.nps.learner.score} unit="" target={`+${G2.nps} or more`} status={criteria[3]!.status}
            detail={report.nps.learner.responses ? `${report.nps.learner.responses} answers in the last ${NPS_WINDOW_DAYS} days.` : 'Learners are asked two weeks after they start.'} />
          <GateCard label="Staff NPS" value={report.nps.staff.score} unit="" target={`+${G2.nps} or more`} status={criteria[4]!.status}
            detail={report.nps.staff.responses ? `${report.nps.staff.responses} answers in the last ${NPS_WINDOW_DAYS} days.` : 'Hub staff are asked two weeks after they join.'} />
          {scope === 'platform' && (
            <GateCard label="Cross-tenant incidents" value={report.crossTenantIncidents} unit="" target="zero" status={criteria[5]!.status}
              detail={report.crossTenantIncidents ? 'Recorded in the incident log below.' : 'None recorded. Row-level security isolation is also tested on every change.'} />
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Weekly active learners</h2>
          <p className="mb-4 text-sm text-muted">The last 8 weeks against the {G2.weeklyActive}% target.</p>
          <WeeklyTrend weeks={report.weekly} target={G2.weeklyActive} />
        </Card>
        <Card className="space-y-6 p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold">Would they recommend Talentral?</h2>
            <p className="text-sm text-muted">Net Promoter Score: percent promoters minus percent detractors, from −100 to +100. Target +{G2.nps}.</p>
          </div>
          <NpsBreakdown title="Learners" result={report.nps.learner} target={G2.nps} />
          <NpsBreakdown title="Staff" result={report.nps.staff} target={G2.nps} />
        </Card>
      </div>

      {report.groups.length > 0 && (
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold">{scope === 'platform' ? 'By hub' : 'By cohort'}</h2>
          <p className="mb-3 text-sm text-muted">Each dot shows on target (green), close (amber, within 10 points) or below (red). Hover a figure for the counts.</p>
          <HealthTable groups={report.groups} label={scope === 'platform' ? 'Hub' : 'Cohort'} staff={scope === 'platform'}
            targets={{ activation: G2.activation, weeklyActive: G2.weeklyActive, attendance: G2.attendance, nps: G2.nps }} />
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold">What people said</h2>
        <p className="mb-2 text-sm text-muted">The latest comments from NPS answers, shown without names.</p>
        <NpsComments comments={report.comments} showHub={scope === 'platform'} />
      </Card>

      {incidentsCard}
    </div>
  );
}

// Learners and staff together, weighted by answers.
function combinedNps(r: HealthReport): number | null {
  const n = r.nps.learner.responses + r.nps.staff.responses;
  if (!n) return null;
  return Math.round(((r.nps.learner.promoters + r.nps.staff.promoters - r.nps.learner.detractors - r.nps.staff.detractors) / n) * 100);
}
