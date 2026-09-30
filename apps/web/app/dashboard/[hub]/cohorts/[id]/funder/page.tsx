// The funder report for one cohort (E11.3): headline indicators and charts, branded for the hub and
// its partners, printed or saved as PDF in one click. Aggregates only; the named list stays in the
// hub's own exports.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { withUser } from '@talentral/db';
import { ASSESSMENT_KINDS, ENGAGEMENT_LABELS, percent, type AssessmentKind, type Engagement } from '@talentral/domain';
import { Funnel, WeeklyAttendance } from '@/components/impact-charts';
import { Card, LinkButton, cx } from '@/components/ui';
import { aiEnabled } from '@/lib/ai';
import { requireHubRole } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { loadFunderReport } from '@/lib/funder-data';
import { logoUrl, partnerLogoUrl } from '@/lib/hubs';
import { PrintButton } from '../../../reports/print-button';
import { SummaryEditor } from './summary-editor';

export const metadata = { title: 'Funder report' };

const fmt = (n: number) => n.toLocaleString('en-NG');
const ROLE: Record<string, string> = { funder: 'Funder', sponsor: 'Sponsor', partner: 'Partner' };

function Section({ n, title, lead, children }: { n: number; title: string; lead?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 break-inside-avoid-page" aria-labelledby={`fr-${n}`}>
      <div className="border-b border-line pb-2">
        <h2 id={`fr-${n}`} className="flex items-baseline gap-3 text-xl font-semibold"><span className="font-display text-[var(--accent)]">{String(n).padStart(2, '0')}</span>{title}</h2>
        {lead && <p className="mt-1 text-sm text-muted">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, note, strong }: { label: string; value: string | number; note?: string; strong?: boolean }) {
  return (
    <div className={cx('break-inside-avoid rounded-xl border p-4', strong ? 'border-line bg-[var(--accent-soft)]' : 'border-line bg-white')}>
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-1 font-display text-[28px] font-semibold leading-tight tabular-nums">{typeof value === 'number' ? fmt(value) : value}</p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  );
}

// Thin horizontal bars for a distribution, with the count and share beside each.
function Bars({ rows, total, label, tone = 'accent' }: { rows: { key: string; n: number }[]; total: number; label: string; tone?: 'accent' | 'teal' }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ol className="space-y-2" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_76px] items-center gap-3 text-sm">
          <span className="leading-tight">{r.key}</span>
          <span className="h-2.5 rounded-full bg-canvas" title={`${r.key}: ${r.n}`}>
            <span className={cx('block h-2.5 rounded-full', tone === 'teal' ? 'bg-teal-700' : 'bg-[var(--accent)]')} style={{ width: `${r.n ? Math.max(3, (r.n / max) * 100) : 0}%` }} />
          </span>
          <span className="text-right tabular-nums"><b>{r.n}</b> <span className="text-xs text-muted">{total ? `${Math.round((r.n / total) * 100)}%` : ''}</span></span>
        </li>
      ))}
    </ol>
  );
}

function Split({ title, rows }: { title: string; rows: { key: string; enrolled: number; completed: number }[] }) {
  if (!rows.length) return null;
  return (
    <div className="break-inside-avoid">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">{title}</h3>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs text-muted"><tr><th className="py-1.5 font-semibold"><span className="sr-only">Group</span></th><th className="py-1.5 text-right font-semibold">Enrolled</th><th className="py-1.5 text-right font-semibold">Completed</th></tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => <tr key={r.key}><td className="py-1.5">{r.key}</td><td className="py-1.5 text-right tabular-nums">{r.enrolled}</td><td className="py-1.5 text-right tabular-nums"><b>{r.completed}</b> <span className="text-xs text-muted">{r.enrolled ? `${Math.round((r.completed / r.enrolled) * 100)}%` : ''}</span></td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

export default async function FunderReport({ params }: { params: Promise<{ hub: string; id: string }> }) {
  const { hub: slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const r = await withUser(user.id, (tx) => loadFunderReport(tx, hub.id, id));
  if (!r) notFound();
  const { cohort: c, impact, reach } = r;
  const k = impact.kpis;
  const logo = logoUrl(hub);
  const accent = /^#[0-9a-f]{6}$/i.test(hub.brand_color ?? '') ? hub.brand_color! : '#2E5BFF';
  const current = Object.values(r.engagement).reduce((a, b) => a + b, 0);
  const putForward = impact.funnel.find((f) => f.stage === 'Put forward')?.n ?? 0;
  const interviewed = impact.funnel.find((f) => f.stage === 'Interviewed')?.n ?? 0;

  return (
    <div className="max-w-4xl" style={{ ['--accent' as string]: accent, ['--accent-soft' as string]: `${accent}12` }}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/${slug}/cohorts/${id}`} className="text-sm font-semibold text-blue hover:underline">← {c.name}</Link>
        <div className="flex flex-wrap gap-2">
          <LinkButton variant="secondary" href={`/dashboard/${slug}/impact/export?cohort=${id}&anonymise=1`}>Anonymised data (Excel)</LinkButton>
          <PrintButton />
        </div>
      </div>

      <Card className="mb-6 p-5 sm:p-6 print:hidden">
        <SummaryEditor slug={slug} cohortId={id} summary={c.funder_summary} ai={aiEnabled()} />
      </Card>

      <article className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)] print:rounded-none print:border-0 print:shadow-none" aria-label="Funder report">
        <div className="h-2" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}99)` }} aria-hidden />
        <div className="space-y-10 p-6 sm:p-10 print:p-0 print:pt-6">
          <header className="space-y-6 border-b-4 border-double border-line pb-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Funder report</p>
                <h1 className="mt-2 font-display text-3xl font-semibold leading-tight">{c.programme}</h1>
                <p className="mt-1 text-lg">{c.name}</p>
                <p className="mt-2 text-[15px] text-muted">Delivered by {hub.name}{hub.state ? `, ${hub.state} State` : ''}</p>
              </div>
              {logo && <img src={logo} alt={`${hub.name} logo`} className="h-16 w-auto max-w-44 object-contain" />}
            </div>
            <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
              <div><dt className="inline text-muted">Cohort dates: </dt><dd className="inline">{c.starts_on ? `${formatDate(c.starts_on)} to ${c.ends_on ? formatDate(c.ends_on) : 'ongoing'}` : 'Not set'}</dd></div>
              <div><dt className="inline text-muted">Status: </dt><dd className="inline capitalize">{c.status}</dd></div>
              <div><dt className="inline text-muted">Completion rule: </dt><dd className="inline">{c.min_attendance}% attendance{r.assessments.length ? ` and ${c.pass_mark}% in assessments` : ''}</dd></div>
              <div><dt className="inline text-muted">Figures as at: </dt><dd className="inline">{formatDate(new Date(), true)} (WAT)</dd></div>
            </dl>
            {r.partners.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Supported by</p>
                <ul className="mt-3 flex flex-wrap items-center gap-x-8 gap-y-4" aria-label="Partners">
                  {r.partners.map((p) => (
                    <li key={p.id} className="flex flex-col items-start gap-1">
                      <img src={partnerLogoUrl(hub.slug, p)} alt={p.name} className="h-10 w-auto max-w-40 object-contain" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{ROLE[p.role] ?? p.role}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </header>

          {c.funder_summary && (
            <section aria-label="Executive summary" className="break-inside-avoid rounded-xl border-l-4 border-[var(--accent)] bg-[var(--accent-soft)] p-5">
              <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent)]">Executive summary</h2>
              <div className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{c.funder_summary}</div>
            </section>
          )}

          <Section n={1} title="Headline indicators">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Applications" value={k.applicants} />
              <Kpi label="Enrolled" value={k.enrolled} note={`${r.activated} started learning`} />
              <Kpi label="Completed" value={k.completed} note={`${percent(k.completionRate)} of enrolled`} strong />
              <Kpi label="Certified" value={k.certified} note="verifiable by QR" strong />
              <Kpi label="Average attendance" value={percent(k.averageAttendance)} note={`${r.held} ${r.held === 1 ? 'session' : 'sessions'} held`} />
              <Kpi label="Average score" value={percent(r.averageScore)} note={`pass mark ${c.pass_mark}%`} />
              <Kpi label="Put forward to employers" value={putForward} />
              <Kpi label="Placed in work" value={k.placed} note={k.placementRate === null ? undefined : `${k.placementRate}% of completers`} strong />
            </div>
          </Section>

          <Section n={2} title="Who the cohort reached" lead="From the answers on learners’ applications. Shares are of those who answered each question.">
            <div className="grid grid-cols-3 gap-3">
              {([['Women', reach.women], ['Aged 18 to 35', reach.youth], ['With a disability', reach.disability]] as const).map(([label, x]) => (
                <Kpi key={label} label={label} value={x.share === null ? 'Not recorded' : percent(x.share)} note={x.share === null ? 'not asked on the form' : `of ${x.answered} who answered`} />
              ))}
            </div>
            <div className="grid gap-8 md:grid-cols-2">
              <Split title="Gender" rows={impact.splits.gender} />
              <Split title="Age" rows={impact.splits.age} />
              <Split title="Local government area" rows={impact.splits.lga} />
              <Split title="Disability" rows={impact.splits.disability} />
            </div>
          </Section>

          <Section n={3} title="From application to work" lead="Each stage as a count, with the share of the stage before it.">
            <Funnel stages={impact.funnel} />
          </Section>

          <Section n={4} title="Attendance" lead={`Weekly attendance over the last 12 weeks. Completion needs ${c.min_attendance}%.`}>
            <WeeklyAttendance weeks={impact.weeks} bar={c.min_attendance} />
          </Section>

          <Section n={5} title="Learning and assessment">
            <div className="grid gap-8 md:grid-cols-2">
              {r.progress && (
                <div className="break-inside-avoid">
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted">Course progress{c.course ? `: ${c.course}` : ''}</h3>
                  <Bars label="Course progress" rows={r.progress.map((b) => ({ key: b.band, n: b.n }))} total={r.progress.reduce((a, b) => a + b.n, 0)} />
                </div>
              )}
              <div className="break-inside-avoid">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted">Assessments</h3>
                {r.assessments.length === 0 ? <p className="text-sm text-muted">No assessments yet.</p> : (
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-line text-xs text-muted"><tr><th className="py-1.5 font-semibold">Assessment</th><th className="py-1.5 pr-4 text-right font-semibold">Graded</th><th className="py-1.5 text-right font-semibold">Average</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {r.assessments.map((a, i) => (
                        <tr key={i}><td className="py-1.5 pr-3">{a.title} <span className="text-xs text-muted">· {ASSESSMENT_KINDS[a.kind as AssessmentKind] ?? a.kind}</span></td><td className="py-1.5 pr-4 text-right tabular-nums">{a.graded}</td><td className="py-1.5 text-right font-semibold tabular-nums">{a.average === null ? '–' : `${Number(a.average)}%`}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            {r.skills.length > 0 && (
              <div className="break-inside-avoid">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted">Skills proven by graded work</h3>
                <Bars label="Skills proven" tone="teal" rows={r.skills.map((s) => ({ key: s.name, n: s.learners }))} total={k.enrolled} />
                <p className="mt-2 text-xs text-muted">Learners who reached the {c.pass_mark}% pass mark on work linked to each skill. These appear as evidenced skills on their Talentral Passports.</p>
              </div>
            )}
          </Section>

          <Section n={6} title="Engagement" lead="Learning activity among learners still on the programme: lessons, quizzes, work handed in, classes and discussion.">
            {current === 0
              ? <p className="text-sm text-muted">Everyone has finished or left the programme, so there is no current activity to show.</p>
              : <Bars label="Engagement" rows={(['active', 'quiet', 'inactive', 'never'] as Engagement[]).map((e) => ({ key: ENGAGEMENT_LABELS[e], n: r.engagement[e] }))} total={current} />}
            {r.returns.nudged > 0 && (
              <p className="text-sm"><b>{r.returns.nudged}</b> inactive {r.returns.nudged === 1 ? 'learner was' : 'learners were'} nudged automatically; <b>{r.returns.returned}</b> came back ({percent(r.returns.rate)}).</p>
            )}
          </Section>

          <Section n={7} title="Work readiness and outcomes" lead="Readiness follows Talentral’s published rules; outcomes are confirmed by the talent team and employers.">
            <div className="grid gap-8 md:grid-cols-2">
              <div className="break-inside-avoid">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted">Readiness</h3>
                <Bars label="Readiness" tone="teal" rows={impact.readiness.map((x) => ({ key: x.label, n: x.n }))} total={k.enrolled} />
              </div>
              <div className="grid grid-cols-3 gap-3 self-start">
                <Kpi label="Put forward" value={putForward} />
                <Kpi label="Interviewed" value={interviewed} />
                <Kpi label="Placed" value={k.placed} />
              </div>
            </div>
          </Section>

          <footer className="space-y-1 border-t border-line pt-4 text-xs text-muted">
            <p>Prepared with Talentral from registers taken at each session, learning activity on Talentral, graded work, certificates issued by the hub and outcomes confirmed by employers. Every change behind these figures is logged with who made it and when.</p>
            <p>This report shows totals and percentages only. Personal data is processed under the Nigeria Data Protection Act 2023.</p>
          </footer>
        </div>
      </article>
    </div>
  );
}
