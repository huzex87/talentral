import Link from 'next/link';
import { withUser } from '@talentral/db';
import { EMPLOYER_STAGES, type EmployerStage } from '@talentral/domain';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { requirePlatformAdmin } from '@/lib/auth';
import { EmployerForm } from '../forms';
import { TalentShell } from '../shell';

export const metadata = { title: 'Employers' };

const TONE: Record<EmployerStage, 'neutral' | 'blue' | 'teal' | 'amber'> = { lead: 'neutral', engaged: 'blue', active: 'teal', dormant: 'amber' };

export default async function Employers() {
  const user = await requirePlatformAdmin();
  const employers = await withUser(user.id, (tx) => tx<{ id: string; name: string; sector: string | null; state: string | null; stage: EmployerStage;
    contact_name: string | null; open_roles: number; candidates: number; placed: number; status: 'pending' | 'verified' | 'suspended'; self_registered: boolean }[]>`
    select e.id, e.name, e.sector, e.state, e.stage, e.contact_name, e.status, e.self_registered,
      (select count(*)::int from public.job_roles r where r.employer_id = e.id and r.status = 'open') as open_roles,
      (select count(*)::int from public.role_candidates c join public.job_roles r on r.id = c.role_id where r.employer_id = e.id) as candidates,
      (select count(*)::int from public.role_candidates c join public.job_roles r on r.id = c.role_id where r.employer_id = e.id and c.stage = 'placed') as placed
    from public.employers e order by (e.status = 'pending') desc, (e.stage = 'dormant'), e.updated_at desc`);

  return (
    <TalentShell user={user} active="employers">
      <PageHeader label="Talent officer console" title="Employers and roles" description="Record employers and the roles they need filled, then build shortlists from consented Passports." />
      {employers.length === 0 ? (
        <EmptyState title="No employers yet">Add the first employer below. Record the roles they need, then put forward candidates.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line" aria-label="Employers">
            {employers.map((e) => (
              <li key={e.id}>
                <Link href={`/platform/talent/employers/${e.id}`} className="grid gap-2 px-5 py-4 transition hover:bg-canvas sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold">{e.name} <Badge tone={TONE[e.stage]}>{EMPLOYER_STAGES[e.stage]}</Badge>
                      {e.status === 'pending' && <Badge tone="amber">Verify</Badge>}{e.status === 'suspended' && <Badge tone="danger">Paused</Badge>}
                      {e.self_registered && e.status === 'verified' && <Badge tone="teal">Self-service</Badge>}</p>
                    <p className="text-sm text-muted">{[e.sector, e.state, e.contact_name].filter(Boolean).join(' · ') || 'No details yet'}</p>
                  </div>
                  <p className="text-sm text-muted"><b className="text-ink">{e.open_roles}</b> open roles · <b className="text-ink">{e.candidates}</b> candidates · <b className="text-teal-700">{e.placed}</b> placed</p>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card className="mt-6 p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold">Add an employer</h2>
        <EmployerForm id={null} />
      </Card>
    </TalentShell>
  );
}
