import { Inbox } from 'lucide-react';
import { withUser, type Programme } from '@talentral/db';
import { APPLICATION_STATUSES, NIGERIAN_STATES, STATUS_LABELS } from '@talentral/domain';
import Link from 'next/link';
import { Card, EmptyState, Input, LinkButton, PageHeader, Select } from '@/components/ui';
import { canManage, requireSelector } from '@/lib/auth';
import { FilterBar } from '@/components/filter-bar';
import { ApplicationsTable, type Row } from './applications-table';
import { SORTS, avgScore, filterParams, isFiltered, orderClause, readFilters, whereClause } from './query';

export const metadata = { title: 'Applications' };
const PAGE = 50;

export default async function Applications({ params, searchParams }: { params: Promise<{ hub: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { hub: slug } = await params;
  const f = readFilters(await searchParams);
  const { user, hub, role } = await requireSelector(slug);
  const { rows, total, programmes, genders } = await withUser(user.id, async (tx) => {
    const where = whereClause(tx, hub.id, f);
    const [count] = await tx<{ n: number }[]>`select count(*)::int as n from public.applications a where ${where}`;
    const rows = await tx<Row[]>`
      select a.id, a.reference, a.full_name, a.email, a.track, a.status, a.submitted_at, a.source,
        a.answers ->> 'state_of_residence' as state, a.answers ->> 'gender' as gender,
        ${avgScore(tx)} as score, (select count(*)::int from public.application_scores s where s.application_id = a.id) as reviews
      from public.applications a
      where ${where} order by ${orderClause(tx, f.sort)} limit ${PAGE} offset ${(f.page - 1) * PAGE}`;
    const programmes = await tx<(Pick<Programme, 'id' | 'title' | 'tracks'> & { scored: boolean })[]>`
      select id, title, tracks, jsonb_array_length(rubric) > 0 as scored from public.programmes where tenant_id = ${hub.id} order by created_at desc`;
    const genders = await tx<{ g: string }[]>`
      select distinct answers ->> 'gender' as g from public.applications where tenant_id = ${hub.id} and answers ->> 'gender' is not null order by 1`;
    return { rows, total: count?.n ?? 0, programmes, genders: genders.map((r) => r.g) };
  });

  const inScope = programmes.filter((p) => !f.programme || p.id === f.programme);
  const tracks = [...new Set(inScope.flatMap((p) => p.tracks))];
  const showScore = inScope.some((p) => p.scored);
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div>
      <PageHeader label="Review" title="Applications"
        description={`${total} ${total === 1 ? 'application' : 'applications'}${isFiltered(f) ? ' match your filters' : ''}.`}
        actions={<>
          {canManage(role) && total > 0 && <LinkButton variant="secondary" href={`/dashboard/${slug}/messages?${filterParams(f)}`}>Message these applicants</LinkButton>}
          <LinkButton variant="secondary" href={`/dashboard/${slug}/applications/export?${filterParams(f)}`}>Download CSV</LinkButton>
        </>} />

      <Card className="mb-4 p-4">
        <FilterBar ariaLabel="Filter applications" applyLabel="Filter" active={[f.programme, f.status, f.track, f.gender, f.state, f.minScore, f.scored].filter(Boolean).length}
          lead={<Input type="search" name="q" defaultValue={f.q} placeholder="Search name, email, phone or reference" aria-label="Search" />}
          fieldsClassName="md:grid md:w-full md:grid-cols-4 md:gap-2"
          after={isFiltered(f) ? <Link href={`/dashboard/${slug}/applications`} className="px-2 py-2.5 text-sm font-semibold text-muted hover:text-ink">Clear</Link> : null}>
          <Select name="programme" defaultValue={f.programme ?? ''} aria-label="Programme"><option value="">All programmes</option>{programmes.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>
          <Select name="status" defaultValue={f.status ?? ''} aria-label="Status"><option value="">All statuses</option>{APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</Select>
          <Select name="track" defaultValue={f.track ?? ''} aria-label="Track"><option value="">All tracks</option>{tracks.map((t) => <option key={t}>{t}</option>)}</Select>
          <Select name="gender" defaultValue={f.gender ?? ''} aria-label="Gender"><option value="">Any gender</option>{genders.map((g) => <option key={g}>{g}</option>)}</Select>
          <Select name="state" defaultValue={f.state ?? ''} aria-label="State of residence"><option value="">Any state</option>{NIGERIAN_STATES.map((s) => <option key={s}>{s}</option>)}</Select>
          {showScore && <>
            <Select name="min" defaultValue={f.minScore ? String(f.minScore) : ''} aria-label="Minimum score"><option value="">Any score</option>{[50, 60, 70, 80, 90].map((n) => <option key={n} value={n}>{n}% and above</option>)}</Select>
            <Select name="scored" defaultValue={f.scored ?? ''} aria-label="Scoring"><option value="">Scored or not</option><option value="no">Not scored yet</option><option value="yes">Scored</option></Select>
          </>}
          <Select name="sort" defaultValue={f.sort} aria-label="Sort">{Object.entries(SORTS).filter(([k]) => k !== 'score' || showScore).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        </FilterBar>
      </Card>

      {rows.length === 0 ? (
        <EmptyState icon={Inbox} title={isFiltered(f) ? 'No applications match these filters' : 'No applications yet'}>
          {isFiltered(f) ? 'Try removing a filter.' : 'When people apply, they appear here. Share your programme link to start receiving applications.'}
        </EmptyState>
      ) : (
        <>
          <ApplicationsTable slug={slug} rows={rows} total={total} filters={filterParams(f)} showScore={showScore} />
          {pages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted">Page {f.page} of {pages}</span>
              <div className="flex gap-2">
                {f.page > 1 && <LinkButton size="sm" variant="ghost" href={`?${filterParams(f, { page: f.page - 1 })}`}>Previous</LinkButton>}
                {f.page < pages && <LinkButton size="sm" variant="ghost" href={`?${filterParams(f, { page: f.page + 1 })}`}>Next</LinkButton>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
