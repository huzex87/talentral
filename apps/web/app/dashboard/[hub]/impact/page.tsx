import { ChartColumn } from 'lucide-react';
import Link from 'next/link';
import { withUser } from '@talentral/db';
import { Funnel, KpiTile, SplitTable, WeeklyAttendance } from '@/components/impact-charts';
import { ReadinessBadge } from '@/components/talent-card';
import { Button, Card, EmptyState, PageHeader, Select, cx } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { loadImpact } from '@/lib/impact-data';
import { FilterBar, FilterField } from '@/components/filter-bar';

export const metadata = { title: 'Impact' };

const DIMENSIONS = [['gender', 'Gender'], ['age', 'Age band'], ['state', 'State'], ['lga', 'LGA'], ['disability', 'Disability'], ['track', 'Track']] as const;
type Dimension = (typeof DIMENSIONS)[number][0];

export default async function ImpactPage({ params, searchParams }: {
  params: Promise<{ hub: string }>; searchParams: Promise<{ programme?: string; cohort?: string; by?: string }>;
}) {
  const { hub: slug } = await params;
  const sp = await searchParams;
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const { impact, programmes, cohorts, filters } = await withUser(user.id, (tx) => loadImpact(tx, hub.id, sp));
  const by: Dimension = DIMENSIONS.some(([k]) => k === sp.by) ? (sp.by as Dimension) : 'gender';
  const k = impact.kpis;
  const [minBar] = await withUser(user.id, (tx) => tx<{ m: number | null }[]>`
    select round(avg(min_attendance))::int as m from public.cohorts where tenant_id = ${hub.id} and (${filters.cohort}::uuid is null or id = ${filters.cohort})`);
  const query = (extra: Record<string, string>) => new URLSearchParams({ ...(filters.programme ? { programme: filters.programme } : {}), ...(filters.cohort ? { cohort: filters.cohort } : {}), ...extra }).toString();
  const readyTotal = impact.readiness.reduce((s, r) => s + r.n, 0) || 1;

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader label="Impact dashboard" title="From application to work"
        description="Live figures for funders and your M&E team: who you reached, who completed, what they can prove, and who found work." />

      <FilterBar ariaLabel="Filter the dashboard" active={[filters.programme, filters.cohort].filter(Boolean).length}
        after={(filters.programme || filters.cohort) ? <Link href={`/dashboard/${slug}/impact`} className="px-2 py-2.5 text-sm font-semibold text-muted hover:text-ink">Clear</Link> : null}>
        <FilterField label="Programme">
          <Select name="programme" defaultValue={filters.programme ?? ''} className="md:min-w-52"><option value="">All programmes</option>{programmes.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>
        </FilterField>
        <FilterField label="Cohort">
          <Select name="cohort" defaultValue={filters.cohort ?? ''} className="md:min-w-44"><option value="">All cohorts</option>{cohorts.filter((c) => !filters.programme || c.programme_id === filters.programme).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </FilterField>
        <input type="hidden" name="by" value={by} />
      </FilterBar>

      {k.enrolled === 0 && k.applicants === 0 ? (
        <EmptyState icon={ChartColumn} title="Nothing to show yet">Figures appear here as soon as people apply to your programmes and join cohorts.</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiTile label="Enrolled" value={k.enrolled} note={`${k.active} still in training`} tone="violet" />
            <KpiTile label="Active this week" value={k.activeThisWeek} note="attended a session in 7 days" />
            <KpiTile label="Average attendance" value={k.averageAttendance === null ? '–' : `${k.averageAttendance}%`} />
            <KpiTile label="Completion, all learners" value={k.completionRate === null ? '–' : `${k.completionRate}%`} note={`${k.completed} completed · includes running cohorts`} tone="blue" />
            <KpiTile label="Certified" value={k.certified} note="verifiable certificates" />
            <KpiTile label="Placed in work" value={k.placed} note={k.placementRate === null ? 'none completed yet' : `${k.placementRate}% of completers`} tone="teal" />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Card className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold">From application to work</h2>
              <p className="mb-4 mt-1 text-sm text-muted">Each stage, with the share who moved on from the stage before.</p>
              <Funnel stages={impact.funnel} />
            </Card>
            <Card className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Work readiness</h2>
              <p className="mb-4 mt-1 text-sm text-muted">Learners by the published readiness rules.</p>
              <ul className="space-y-3">
                {impact.readiness.map((r) => (
                  <li key={r.level} className="grid grid-cols-[150px_minmax(0,1fr)_40px] items-center gap-3 text-sm">
                    <ReadinessBadge level={r.level} className="justify-self-start" />
                    <span className="h-2.5 rounded-full bg-canvas" title={`${r.label}: ${r.n}`}><span className="block h-2.5 rounded-full bg-violet" style={{ width: `${(r.n / readyTotal) * 100}%` }} /></span>
                    <b className="text-right tabular-nums">{r.n}</b>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Weekly attendance</h2>
            <p className="mb-4 mt-1 text-sm text-muted">The last 12 weeks. Hover a bar for the figures.</p>
            <WeeklyAttendance weeks={impact.weeks} bar={minBar?.m ?? 75} />
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-lg font-semibold">Who you reached</h2><p className="mt-1 text-sm text-muted">Outcomes by group, from what applicants told you.</p></div>
              <nav className="flex flex-wrap gap-1 rounded-xl bg-canvas p-1" aria-label="Break down by">
                {DIMENSIONS.map(([key, label]) => (
                  <Link key={key} href={`?${query({ by: key })}`} scroll={false} aria-current={by === key ? 'true' : undefined}
                    className={cx('rounded-lg px-3 py-1.5 text-sm font-semibold transition', by === key ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink')}>{label}</Link>
                ))}
              </nav>
            </div>
            <SplitTable rows={impact.splits[by]} label={DIMENSIONS.find(([key]) => key === by)![1]} />
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Export for M&amp;E</h2>
            <p className="mb-4 mt-1 text-sm text-muted">One row per learner with attendance, certificates, readiness and work outcomes, for the filters above. Every export is recorded in your audit log.</p>
            <form action={`/dashboard/${slug}/impact/export`} method="get" className="flex flex-wrap items-center gap-3">
              {filters.programme && <input type="hidden" name="programme" value={filters.programme} />}
              {filters.cohort && <input type="hidden" name="cohort" value={filters.cohort} />}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="anonymise" value="1" defaultChecked className="size-4 accent-[var(--color-blue)]" />
                Anonymise (no names, contacts or dates of birth)</label>
              <span className="flex gap-2 sm:ml-auto">
                <Button type="submit" name="format" value="xlsx">Download Excel</Button>
                <Button type="submit" name="format" value="csv" variant="secondary">Download CSV</Button>
              </span>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
