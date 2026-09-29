import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { CANDIDATE_STAGES, INTEREST, JOB_TYPES, type CandidateStage, type Interest } from '@talentral/domain';
import { TalentCard } from '@/components/talent-card';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { requirePlatformAdmin } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { loadPassport, toTalentCard } from '@/lib/passport-data';
import { setVerified } from '../../actions';
import { AddToRoleForm } from '../../forms';
import { TalentShell } from '../../shell';

export const metadata = { title: 'Talent profile' };

export default async function Person({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await withUser(user.id, async (tx) => {
    const loaded = await loadPassport(tx, id);
    if (!loaded.passport?.discoverable) return null;
    const [person] = await tx<{ full_name: string | null; email: string; phone: string | null }[]>`
      select u.full_name, u.email::text,
        (select a.phone from public.applications a where a.email = u.email order by a.submitted_at desc limit 1) as phone
      from public.users u where u.id = ${id}`;
    const roles = await tx<{ id: string; title: string; employer: string }[]>`
      select r.id, r.title, e.name as employer from public.job_roles r join public.employers e on e.id = r.employer_id
      where r.status = 'open' and not exists (select 1 from public.role_candidates c where c.role_id = r.id and c.user_id = ${id})
      order by e.name, r.title`;
    const on = await tx<{ role_id: string; title: string; employer: string; interest: Interest; stage: CandidateStage; placement_type: keyof typeof JOB_TYPES | null; start_date: string | null }[]>`
      select c.role_id, r.title, e.name as employer, c.interest, c.stage, c.placement_type, c.start_date::text
      from public.role_candidates c join public.job_roles r on r.id = c.role_id join public.employers e on e.id = r.employer_id
      where c.user_id = ${id} order by c.created_at desc`;
    return { ...loaded, person: person!, roles, on };
  });
  if (!data) notFound();
  const p = data.passport!;
  const name = data.person.full_name ?? data.person.email;

  return (
    <TalentShell user={user} active="search">
      <PageHeader label={<Link href="/platform/talent" className="hover:underline">← Talent</Link>} title={name} description={p.headline ?? undefined} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <TalentCard t={toTalentCard(name, p, data.learning, data.readiness)} />
        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">Contact (officers only)</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="text-muted">Email</dt><dd><a href={`mailto:${data.person.email}`} className="font-semibold text-blue hover:underline">{data.person.email}</a></dd></div>
              {data.person.phone && <div><dt className="text-muted">Phone</dt><dd><a href={`tel:${data.person.phone}`} className="font-semibold text-blue hover:underline">{data.person.phone}</a></dd></div>}
              {p.city && <div><dt className="text-muted">Town or city</dt><dd className="font-semibold">{p.city}</dd></div>}
              <div><dt className="text-muted">Visible since</dt><dd className="font-semibold">{formatDate(p.discoverable_at)}</dd></div>
              <div><dt className="text-muted">Shares with employers</dt><dd>{p.employer_sharing ? <Badge tone="teal">Yes</Badge> : <Badge tone="amber">No, cannot be sent to employers</Badge>}</dd></div>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">Verification</h2>
            {p.verified_at ? (
              <>
                <p className="mt-2 text-sm">Verified on {formatDate(p.verified_at)}. They show as <b>Ready and Verified</b> once they hold a certificate.</p>
                <form action={setVerified.bind(null, id, false)} className="mt-3"><Button variant="ghost" size="sm">Remove verification</Button></form>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted">Verify after you have checked their identity (for example a government ID on a call) and reviewed their evidence.</p>
                <form action={setVerified.bind(null, id, true)} className="mt-3"><Button size="sm">Mark as verified</Button></form>
              </>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">Put forward for a role</h2>
            <p className="mb-3 mt-1 text-sm text-muted">We email them to confirm interest before any employer sees them.</p>
            <AddToRoleForm userId={id} roles={data.roles.map((r) => ({ id: r.id, label: `${r.title} · ${r.employer}` }))} />
            {data.on.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
                {data.on.map((o) => (
                  <li key={o.role_id} className="flex items-start justify-between gap-2">
                    <Link href={`/platform/talent/roles/${o.role_id}`} className="min-w-0 font-semibold hover:text-blue">{o.title}<span className="block text-xs font-normal text-muted">{o.employer}</span></Link>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={o.stage === 'placed' ? 'teal' : o.interest === 'confirmed' ? 'blue' : 'neutral'}>{o.stage === 'shortlisted' ? INTEREST[o.interest] : CANDIDATE_STAGES[o.stage]}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </TalentShell>
  );
}
