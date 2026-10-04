// The body of both pilot outcomes views (Gate G3): the four criteria, hires and the 90-day check,
// a table by hub (platform) or cohort (hub), and, for the platform, which employers are engaged.
import Link from 'next/link';
import { G3, GATE_LABELS, g3Criteria } from '@talentral/domain';
import type { OutcomesReport } from '@/lib/outcomes-data';
import { GateCard, RateCell, rateDetail } from './health';
import { Badge, Card, EmptyState } from './ui';

export function OutcomesView({ report, scope }: { report: OutcomesReport; scope: 'platform' | 'hub' }) {
  const s = report.summary;
  const criteria = g3Criteria(s, report.employersEngaged);
  const status = (k: string) => criteria.find((c) => c.key === k)!.status;
  const met = criteria.filter((c) => c.status === 'met').length;

  if (!report.learners && !s.placements && scope === 'hub') {
    return <EmptyState title="No learners yet">Pilot outcomes appear once learners are enrolled: completion when cohorts end, readiness once certificates are issued, and placements when employers hire.</EmptyState>;
  }

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4 border-midnight bg-midnight! p-5 text-white sm:p-6">
        <div>
          <p className="text-[13px] font-medium text-teal">Gate G3 · Pilot outcomes</p>
          <p className="mt-1 font-display text-2xl font-semibold">{met} of {criteria.length} criteria on target</p>
          <p className="mt-0.5 text-sm text-white/70">{report.learners.toLocaleString('en-NG')} {report.learners === 1 ? 'learner' : 'learners'} · {s.placements} {s.placements === 1 ? 'placement' : 'placements'} · figures as of today ({report.today}), West Africa Time</p>
        </div>
        <ul className="flex gap-1.5" aria-hidden>
          {criteria.map((c) => (
            <li key={c.key} className={`h-2.5 w-7 rounded-full ${c.status === 'met' ? 'bg-teal' : c.status === 'near' ? 'bg-amber-50' : c.status === 'below' ? 'bg-danger-50' : 'bg-white/20'}`} title={`${c.label}: ${GATE_LABELS[c.status]}`} />
          ))}
        </ul>
      </Card>

      <section aria-labelledby="g3-criteria">
        <h2 id="g3-criteria" className="sr-only">Gate G3 criteria</h2>
        <div className={`grid gap-3 sm:grid-cols-2 ${scope === 'platform' ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
          <GateCard label="Completion" value={s.completion.rate} target={`${G3.completion}% or more`} status={status('completion')}
            detail={rateDetail(s.completion, 'learners in ended cohorts completed', 'Measured once a cohort ends.')} />
          <GateCard label="Readiness assessed" value={s.assessed.rate} target={`${G3.readinessAssessed}% of completers`} status={status('assessed')}
            detail={rateDetail(s.assessed, 'completers hold a certificate or a verified Passport', 'Measured once learners complete.')} />
          {scope === 'platform' && (
            <GateCard label="Employers engaged" value={report.employersEngaged} unit="" signed={false} target={`${G3.employersEngaged} or more`} status={status('employers')}
              detail={`Employers who posted a job, received a shortlist or had a candidate put forward or applying. ${(report.employers?.length ?? 0).toLocaleString('en-NG')} on record.`} />
          )}
          <GateCard label="Placements" value={s.placements} unit="" signed={false} target="the first ones recorded" status={status('placements')}
            detail={s.placements ? `${s.confirmed} of ${s.placements} confirmed by the employer or with them.` : 'Recorded when an employer or talent officer records a hire.'} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Placements and the 90-day check</h2>
          <p className="mb-4 text-sm text-muted">Hires count once recorded; confirmed hires and those still in the job at 90 days are the outcomes funders trust most.</p>
          <dl className="grid grid-cols-3 gap-3 text-center">
            <Figure label="Hired" value={s.placements} />
            <Figure label="Employer-confirmed" value={s.confirmed} />
            <Figure label="Still in the job at 90 days" value={s.retention.rate === null ? '–' : `${s.retention.rate}%`} hint={s.retention.of ? `${s.retention.count} of ${s.retention.of} answered` : 'No checks answered yet'} />
          </dl>
          {s.retentionDue > 0 && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {s.retentionDue} 90-day {s.retentionDue === 1 ? 'check is' : 'checks are'} open and not answered yet.
              {scope === 'platform' && <> <Link href="/platform/talent/placements?show=due" className="font-semibold underline underline-offset-2">Follow up</Link></>}
            </p>
          )}
        </Card>
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold">How these are measured</h2>
          <ul className="mt-2 space-y-2 text-sm text-muted">
            <li><b className="text-ink">Completion:</b> learners marked completed, among everyone in a cohort that has ended (dropouts included), plus anyone who completed early.</li>
            <li><b className="text-ink">Readiness assessed:</b> completers whose readiness was judged under the published rules: a Talentral certificate, or a Passport a talent officer verified.</li>
            {scope === 'platform' && <li><b className="text-ink">Employers engaged:</b> any employer who posted a job, received a shortlist, or had someone put forward or apply.</li>}
            <li><b className="text-ink">Placements:</b> learners with a hire recorded by an employer or a talent officer. Employers confirm hires the talent team records.</li>
          </ul>
        </Card>
      </div>

      {report.groups.length > 0 && (
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold">{scope === 'platform' ? 'By hub' : 'By cohort'}</h2>
          <p className="mb-3 text-sm text-muted">Each dot shows on target (green), close (amber, within 10 points) or below (red). Hover a figure for the counts.</p>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`Pilot outcomes by ${scope === 'platform' ? 'hub' : 'cohort'}`}>
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="border-b border-line text-xs text-muted font-medium">
                <tr>
                  <th className="px-3 py-2 font-semibold">{scope === 'platform' ? 'Hub' : 'Cohort'}</th>
                  <th className="px-3 py-2 text-right font-semibold">Learners</th>
                  <th className="px-3 py-2 text-right font-semibold">Completion</th>
                  <th className="px-3 py-2 text-right font-semibold">Readiness assessed</th>
                  <th className="px-3 py-2 text-right font-semibold">Placed</th>
                  <th className="px-3 py-2 text-right font-semibold">Confirmed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.groups.map((g) => (
                  <tr key={g.id}>
                    <th scope="row" className="max-w-64 truncate px-3 py-2.5 font-semibold">{g.name}</th>
                    <td className="px-3 py-2.5 text-right tabular-nums">{g.learners.toLocaleString('en-NG')}</td>
                    <RateCell r={g.completion} target={G3.completion} />
                    <RateCell r={g.assessed} target={G3.readinessAssessed} />
                    <td className="px-3 py-2.5 text-right tabular-nums">{g.placements}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{g.confirmed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {report.employers && (
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Employers</h2>
          <p className="mb-3 text-sm text-muted">{report.employersEngaged} of {report.employers.length} engaged. Engaged employers come first.</p>
          {report.employers.length === 0 ? <p className="text-sm text-muted">No employers recorded yet.</p> : (
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Employers engaged">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="border-b border-line text-xs text-muted font-medium">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Employer</th>
                    <th className="px-3 py-2 text-right font-semibold">Jobs</th>
                    <th className="px-3 py-2 text-right font-semibold">Candidates</th>
                    <th className="px-3 py-2 text-right font-semibold">Shortlists</th>
                    <th className="px-3 py-2 text-right font-semibold">Hires</th>
                    <th className="px-3 py-2 font-semibold">Engaged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {report.employers.map((e) => (
                    <tr key={e.id}>
                      <th scope="row" className="max-w-64 truncate px-3 py-2.5 font-semibold"><Link href={`/platform/talent/employers/${e.id}`} className="hover:text-blue">{e.name}</Link></th>
                      <td className="px-3 py-2.5 text-right tabular-nums">{e.jobs}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{e.candidates}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{e.shortlists}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{e.hires}</td>
                      <td className="px-3 py-2.5">{e.engaged ? <Badge tone="teal">Engaged</Badge> : <Badge tone="neutral">Not yet</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="flex flex-col-reverse justify-end rounded-xl bg-canvas p-3">
      <dt className="mt-0.5 text-xs font-semibold text-muted">{label}</dt>
      <dd className="font-display text-3xl font-semibold tabular-nums">{value}{hint && <span className="mt-1 block font-sans text-[11px] font-normal text-muted">{hint}</span>}</dd>
    </div>
  );
}
