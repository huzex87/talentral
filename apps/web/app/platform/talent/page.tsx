import Link from 'next/link';
import { withUser } from '@talentral/db';
import { AVAILABILITY, LANGUAGES, NIGERIAN_STATES, READINESS, WORK_MODES } from '@talentral/domain';
import { ReadinessBadge } from '@/components/talent-card';
import { Card, EmptyState, Input, PageHeader, Select } from '@/components/ui';
import { requirePlatformAdmin } from '@/lib/auth';
import { discoverableTalent, filterTalent, type TalentFilters } from '@/lib/talent-data';
import { Stat, TalentShell } from './shell';
import { GraduationCap, UserSearch } from 'lucide-react';
import { FilterBar } from '@/components/filter-bar';

export const metadata = { title: 'Talent' };

export default async function TalentSearch({ searchParams }: { searchParams: Promise<TalentFilters> }) {
  const user = await requirePlatformAdmin();
  const f = await searchParams;
  const { all, stats } = await withUser(user.id, async (tx) => {
    const all = await discoverableTalent(tx);
    const [stats] = await tx<{ open_roles: number; placed: number; awaiting: number }[]>`
      select (select count(*)::int from public.job_roles where status = 'open') as open_roles,
             (select count(*)::int from public.role_candidates where stage = 'placed') as placed,
             (select count(*)::int from public.role_candidates where interest = 'pending') as awaiting`;
    return { all, stats: stats! };
  });
  const rows = filterTalent(all, f);
  const hubs = [...new Set(all.flatMap((r) => r.hubs))].sort();
  const filtered = Object.values(f).some(Boolean);

  return (
    <TalentShell user={user} active="search">
      <PageHeader label="Talent officer console" title="Find talent"
        description="Only learners who have chosen to be visible to talent officers appear here. Withdrawing consent removes them at once." />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Visible Passports" value={all.length} tone="violet" />
        <Stat label="Ready or better" value={all.filter((r) => r.readiness.startsWith('ready')).length} tone="blue" />
        <Stat label="Open roles" value={stats.open_roles} />
        <Stat label="Placed" value={stats.placed} tone="teal" />
      </div>

      <Card className="mb-5 p-4">
        <FilterBar ariaLabel="Search talent" applyLabel="Search" active={[f.readiness, f.state, f.work_mode, f.availability, f.language, f.hub].filter(Boolean).length}
          lead={<Input type="search" name="q" defaultValue={f.q ?? ''} placeholder="Skill, programme, name or headline" aria-label="Search talent" />}
          fieldsClassName="md:grid md:w-full md:grid-cols-3 md:gap-3 lg:grid-cols-6"
          after={<p className="flex w-full items-center gap-3 text-sm text-muted">{rows.length} of {all.length}{filtered && <Link href="/platform/talent" className="font-semibold text-blue hover:underline">Clear filters</Link>}</p>}>
          <Select name="readiness" defaultValue={f.readiness ?? ''} aria-label="Readiness"><option value="">Any readiness</option>{Object.entries(READINESS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <Select name="state" defaultValue={f.state ?? ''} aria-label="State"><option value="">Any state</option>{NIGERIAN_STATES.map((s) => <option key={s}>{s}</option>)}</Select>
          <Select name="work_mode" defaultValue={f.work_mode ?? ''} aria-label="Work mode"><option value="">Any work mode</option>{Object.entries(WORK_MODES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <Select name="availability" defaultValue={f.availability ?? ''} aria-label="Availability"><option value="">Any availability</option>{Object.entries(AVAILABILITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          <Select name="language" defaultValue={f.language ?? ''} aria-label="Language"><option value="">Any language</option>{LANGUAGES.map((l) => <option key={l}>{l}</option>)}</Select>
          <Select name="hub" defaultValue={f.hub ?? ''} aria-label="Trained at"><option value="">Any hub</option>{hubs.map((h) => <option key={h}>{h}</option>)}</Select>
        </FilterBar>
      </Card>

      {rows.length === 0 ? (
        <EmptyState icon={UserSearch} title={all.length ? 'Nobody matches these filters' : 'No visible Passports yet'}>
          {all.length ? 'Try fewer filters or a broader skill.' : 'Learners appear here once they complete their Passport and turn on visibility to talent officers. Certificate emails invite them to do this.'}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Talent">
          {rows.map((r) => (
            <li key={r.user_id}>
              <Link href={`/platform/talent/people/${r.user_id}`} className="block h-full">
                <Card className="h-full p-5 transition hover:border-blue/40 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-lg font-semibold">{r.full_name ?? r.email}</p>
                      <p className="truncate text-sm text-muted">{r.headline}</p>
                    </div>
                    <ReadinessBadge level={r.readiness} />
                  </div>
                  <p className="mt-2 text-xs text-muted">{[r.state, AVAILABILITY[r.availability], r.work_modes.map((m) => WORK_MODES[m as keyof typeof WORK_MODES]).join(', ')].filter(Boolean).join(' · ')}</p>
                  {r.programmes.length > 0 && <p className="mt-2 flex items-center gap-1.5 text-sm"><GraduationCap className="size-4 shrink-0 text-muted" aria-hidden />{r.programmes.join(', ')}</p>}
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {r.skills.slice(0, 6).map((s) => <li key={s} className="rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold text-muted">{s}</li>)}
                    {r.skills.length > 6 && <li className="px-1 text-xs text-muted">+{r.skills.length - 6}</li>}
                  </ul>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </TalentShell>
  );
}
