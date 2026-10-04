import { withUser, type Programme } from '@talentral/db';
import { STATUS_LABELS, buildSelectionReport, type Breakdown, type Criterion, type ReportApplication } from '@talentral/domain';
import { Card, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { logoUrl } from '@/lib/hubs';
import { PrintButton } from './print-button';

export const metadata = { title: 'Reports' };

const pct = (v: number | null) => (v === null ? '–' : `${v}%`);
const share = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–');

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-line bg-white p-4 break-inside-avoid">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  );
}

function Table({ title, rows, totals }: { title: string; rows: Breakdown[]; totals: { applicants: number; selected: number } }) {
  if (!rows.length) return null;
  return (
    <div className="break-inside-avoid">
      <h3 className="mb-2 text-sm font-semibold text-ink">{title}</h3>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs text-muted">
          <tr><th className="py-1.5 pr-2 font-semibold"> </th><th className="py-1.5 text-right font-semibold">Applicants</th><th className="py-1.5 text-right font-semibold">Share</th><th className="py-1.5 text-right font-semibold">Selected</th><th className="py-1.5 text-right font-semibold">Share</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-1.5 pr-2">{r.key}</td>
              <td className="py-1.5 text-right tabular-nums">{r.applicants}</td>
              <td className="py-1.5 text-right tabular-nums text-muted">{share(r.applicants, totals.applicants)}</td>
              <td className="py-1.5 text-right font-semibold tabular-nums">{r.selected}</td>
              <td className="py-1.5 text-right tabular-nums text-muted">{share(r.selected, totals.selected)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid-page space-y-4">
      <h2 className="flex items-baseline gap-3 border-b border-line pb-2 text-xl font-semibold"><span className="text-violet">{n}.</span>{title}</h2>
      {children}
    </section>
  );
}

export default async function Reports({ params, searchParams }: { params: Promise<{ hub: string }>; searchParams: Promise<{ programme?: string }> }) {
  const { hub: slug } = await params;
  const { programme } = await searchParams;
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);

  const data = await withUser(user.id, async (tx) => {
    const programmes = await tx<Programme[]>`select * from public.programmes where tenant_id = ${hub.id} order by created_at desc`;
    const p = programmes.find((x) => x.id === programme) ?? programmes[0];
    if (!p) return { programmes, p: null };
    const apps = await tx<(Omit<ReportApplication, 'score'> & { score: string | null })[]>`
      select a.status, a.source, a.track, a.answers,
        (select round(avg(s.percent), 1) from public.application_scores s where s.application_id = a.id) as score,
        (select count(*)::int from public.application_scores s where s.application_id = a.id) as reviews
      from public.applications a where a.programme_id = ${p.id} and a.tenant_id = ${hub.id}`;
    const [reviewers] = await tx<{ n: number }[]>`
      select count(distinct s.reviewer_id)::int as n from public.application_scores s join public.applications a on a.id = s.application_id where a.programme_id = ${p.id}`;
    const [comms] = await tx<{ messages: number; emailed: number; texted: number }[]>`
      select count(*)::int as messages, coalesce(sum(emailed), 0)::int as emailed, coalesce(sum(texted), 0)::int as texted
      from public.messages where tenant_id = ${hub.id} and coalesce(audience ->> 'programme', ${p.id}) = ${p.id} and created_at >= ${p.created_at}`;
    const [notices] = await tx<{ n: number }[]>`
      select coalesce(sum((l.metadata ->> 'emailed')::int), 0)::int as n from public.audit_log l
      where l.tenant_id = ${hub.id} and l.action = 'applications.notified' and l.at >= ${p.created_at}`;
    return { programmes, p, apps: apps.map((a) => ({ ...a, score: a.score === null ? null : Number(a.score) })), reviewers: reviewers?.n ?? 0, comms: comms!, notices: notices?.n ?? 0 };
  });

  if (!data.p) {
    return (
      <div>
        <PageHeader label="Reports" title="Milestone reports" />
        <EmptyState title="No programmes yet">Reports appear once you have a programme with applicants.</EmptyState>
      </div>
    );
  }
  const { p, apps, reviewers, comms, notices } = data as Required<typeof data> & { p: Programme };
  const r = buildSelectionReport(apps!, p.opens_at ? new Date(p.opens_at) : new Date());
  const rubric = p.rubric as Criterion[];
  const logo = logoUrl(hub);
  const t = r.totals;
  const exportBase = `/dashboard/${slug}/applications/export?programme=${p.id}`;

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <PageHeader label="Reports" title="Milestone report" description="Evidence that the call for applications and selection are complete, ready to share with funders such as iDICE." />
        <div className="flex flex-wrap gap-2">
          {data.programmes.length > 1 && (
            <form className="flex gap-2">
              <select name="programme" defaultValue={p.id} aria-label="Programme" className="h-10 rounded-[var(--radius-control)] border border-line-strong bg-white px-3 text-base shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none hover:border-mist focus:border-blue focus:shadow-[0_0_0_4px_rgba(46,91,255,0.12)] sm:text-sm">
                {data.programmes.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select>
              <button className="h-11 rounded-[var(--radius-control)] px-3 font-semibold text-blue hover:bg-blue-50">Show</button>
            </form>
          )}
          <PrintButton />
        </div>
      </div>

      <article className="space-y-10 rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-10 print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b-4 border-double border-line pb-6">
          <div>
            <p className="text-[13px] font-medium text-muted">Milestone report · Call for applications and selection</p>
            <h1 className="mt-2 font-display text-3xl font-semibold leading-tight">{p.title}</h1>
            <p className="mt-2 text-[15px] text-muted">{hub.name}{hub.state ? `, ${hub.state} State` : ''}</p>
            <dl className="mt-4 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
              <div><dt className="inline text-muted">Applications opened: </dt><dd className="inline">{p.opens_at ? formatDate(p.opens_at) : formatDate(p.created_at)}</dd></div>
              <div><dt className="inline text-muted">Applications closed: </dt><dd className="inline">{p.closes_at ? formatDate(p.closes_at) : p.status === 'closed' ? 'Closed' : 'Still open'}</dd></div>
              <div><dt className="inline text-muted">Report generated: </dt><dd className="inline">{formatDate(new Date(), true)} (WAT)</dd></div>
              {p.capacity && <div><dt className="inline text-muted">Places available: </dt><dd className="inline">{p.capacity}</dd></div>}
            </dl>
          </div>
          {logo && <img src={logo} alt={`${hub.name} logo`} className="h-16 w-auto max-w-40 object-contain" />}
        </header>

        <Section n={1} title="Summary">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Applicants" value={t.applicants} note={t.imported ? `${t.applied} applied here, ${t.imported} imported` : undefined} />
            <Stat label="Selected" value={t.selected} note={`${t.accepted} accepted, ${t.offered} offered`} />
            <Stat label="Selection rate" value={pct(r.rates.selection)} note="of those who applied here" />
            <Stat label="Places filled" value={p.capacity ? share(t.selected, p.capacity) : '–'} note={p.capacity ? `${t.selected} of ${p.capacity}` : 'No capacity set'} />
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Women among applicants" value={pct(r.rates.womenApplicants)} />
            <Stat label="Women among selected" value={pct(r.rates.womenSelected)} />
            <Stat label="Youth (18 to 35) selected" value={pct(r.rates.youthSelected)} />
            <Stat label="Selected with a disability" value={pct(r.rates.disabilitySelected)} />
          </div>
          <p className="text-xs text-muted">Rates count only people who answered the question. Ages are taken on the opening date.</p>
        </Section>

        <Section n={2} title="Application funnel">
          <div className="space-y-2">
            {r.funnel.map((f) => (
              <div key={f.status} className="grid grid-cols-[150px_minmax(0,1fr)_48px] items-center gap-3 text-sm">
                <span>{STATUS_LABELS[f.status]}</span>
                <div className="h-3 rounded-full bg-canvas"><div className="h-3 rounded-full bg-blue print:bg-ink" style={{ width: `${Math.max(2, (f.n / Math.max(t.applicants, 1)) * 100)}%` }} /></div>
                <span className="text-right font-semibold tabular-nums">{f.n}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section n={3} title="Who applied and who was selected">
          <div className="grid gap-8 md:grid-cols-2">
            <Table title="Gender" rows={r.breakdowns.gender} totals={{ applicants: t.applicants, selected: t.selected }} />
            <Table title="Age" rows={r.breakdowns.age} totals={{ applicants: t.applicants, selected: t.selected }} />
            <Table title="Disability" rows={r.breakdowns.disability} totals={{ applicants: t.applicants, selected: t.selected }} />
            <Table title="Track" rows={r.breakdowns.track} totals={{ applicants: t.applicants, selected: t.selected }} />
            <Table title="Education" rows={r.breakdowns.education} totals={{ applicants: t.applicants, selected: t.selected }} />
            <Table title="Employment" rows={r.breakdowns.employment} totals={{ applicants: t.applicants, selected: t.selected }} />
            <Table title="State of residence" rows={r.breakdowns.state.slice(0, 12)} totals={{ applicants: t.applicants, selected: t.selected }} />
          </div>
        </Section>

        <Section n={4} title="How selection was done">
          {t.imported > 0 && (
            <p className="text-[15px]"><b>{t.imported}</b> {t.imported === 1 ? 'participant was' : 'participants were'} selected on an external platform and imported into Talentral, with consent confirmed by the hub.</p>
          )}
          {rubric.length > 0 ? (
            <>
              <p className="text-[15px]">Applications were scored against a weighted rubric by <b>{reviewers}</b> {reviewers === 1 ? 'reviewer' : 'reviewers'}. {r.scoring.scored} of {t.applied} applications were scored.</p>
              <table className="w-full text-left text-sm break-inside-avoid">
                <thead className="border-b border-line text-xs text-muted"><tr><th className="py-1.5 font-semibold">Criterion</th><th className="py-1.5 text-right font-semibold">Scored out of</th><th className="py-1.5 text-right font-semibold">Weight</th><th className="py-1.5 text-right font-semibold">Share of total</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {rubric.map((c) => {
                    const total = rubric.reduce((s, x) => s + x.max * x.weight, 0);
                    return <tr key={c.id}><td className="py-1.5">{c.label}</td><td className="py-1.5 text-right tabular-nums">{c.max}</td><td className="py-1.5 text-right tabular-nums">×{c.weight}</td><td className="py-1.5 text-right tabular-nums">{share(c.max * c.weight, total)}</td></tr>;
                  })}
                </tbody>
              </table>
              <div className="grid gap-3 sm:grid-cols-4">
                <Stat label="Scored 70% or more" value={r.scoring.bands.high} />
                <Stat label="Scored 50 to 69%" value={r.scoring.bands.mid} />
                <Stat label="Average score, selected" value={pct(r.scoring.averageSelected)} />
                <Stat label="Average score, not selected" value={pct(r.scoring.averageNotSelected)} />
              </div>
            </>
          ) : t.imported === 0 && <p className="text-[15px] text-muted">No screening rubric was used for this programme.</p>}
        </Section>

        <Section n={5} title="Communication with applicants">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Decision emails" value={notices} note="shortlisting, offers and outcomes" />
            <Stat label="Group messages" value={comms.messages} note="to this programme or all applicants" />
            <Stat label="Emails delivered" value={comms.emailed} note="group messages" />
            <Stat label="SMS delivered" value={comms.texted} note="group messages" />
          </div>
          <p className="text-xs text-muted">Every applicant received an acknowledgement with a reference number when they applied.</p>
        </Section>

        <footer className="border-t border-line pt-4 text-xs text-muted">
          Prepared with Talentral from records kept as applications were received and reviewed. Every status change is logged with who made it and when; the full log is available on request.
          Personal data is processed under the Nigeria Data Protection Act 2023.
        </footer>
      </article>

      <Card className="mt-6 p-5 print:hidden">
        <h2 className="font-semibold">Participant lists</h2>
        <p className="mt-1 text-sm text-muted">Spreadsheets with every answer, for funders who need the named list of selected participants.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <LinkButton size="sm" variant="secondary" href={`${exportBase}&status=accepted`}>Accepted (CSV)</LinkButton>
          <LinkButton size="sm" variant="secondary" href={`${exportBase}&status=offered`}>Offered (CSV)</LinkButton>
          <LinkButton size="sm" variant="ghost" href={exportBase}>All applicants (CSV)</LinkButton>
        </div>
      </Card>
    </div>
  );
}
