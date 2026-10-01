import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { JOB_TYPES, WORK_MODES, payRange, verificationChecks } from '@talentral/domain';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { requirePlatformAdmin } from '@/lib/auth';
import { EmployerForm, EmployerReview, RoleForm, type EmployerValues } from '../../forms';
import { TalentShell } from '../../shell';

export const metadata = { title: 'Employer' };

export default async function Employer({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePlatformAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await withUser(user.id, async (tx) => {
    const [employer] = await tx<(EmployerValues & { id: string; status: 'pending' | 'verified' | 'rejected' | 'suspended'; self_registered: boolean; verified_at: Date | null; size: string | null; created_at: Date;
      cac_number: string | null; review_note: string | null; reviewed_at: Date | null; review_requested_at: Date | null })[]>`select * from public.employers where id = ${id}`;
    if (!employer) return null;
    const members = await tx<{ email: string; full_name: string | null; role: string }[]>`
      select u.email::text, u.full_name, m.role from public.employer_members m join public.users u on u.id = m.user_id where m.employer_id = ${id} order by m.created_at`;
    const roles = await tx<{ id: string; title: string; status: string; work_mode: keyof typeof WORK_MODES; job_type: keyof typeof JOB_TYPES;
      state: string | null; pay_min: number | null; pay_max: number | null; openings: number; candidates: number; confirmed: number; placed: number }[]>`
      select r.id, r.title, r.status, r.work_mode, r.job_type, r.state, r.pay_min, r.pay_max, r.openings,
        (select count(*)::int from public.role_candidates c where c.role_id = r.id) as candidates,
        (select count(*)::int from public.role_candidates c where c.role_id = r.id and c.interest = 'confirmed') as confirmed,
        (select count(*)::int from public.role_candidates c where c.role_id = r.id and c.stage = 'placed') as placed
      from public.job_roles r where r.employer_id = ${id} order by (r.status = 'open') desc, r.created_at desc`;
    const skills = await tx<{ name: string; track: string }[]>`select name, track from public.skills where tenant_id is null order by track, name`;
    return { employer, roles, skills, members };
  });
  if (!data) notFound();
  const { employer, roles, skills, members } = data;

  return (
    <TalentShell user={user} active="employers">
      <PageHeader label={<Link href="/platform/talent/employers" className="hover:underline">← Employers</Link>} title={employer.name}
        description={[employer.sector, employer.state].filter(Boolean).join(' · ') || undefined} />
      {employer.self_registered && (
        <Card className={`mb-6 p-5 sm:p-6 ${employer.status === 'pending' ? 'border-amber-800/25 bg-amber-50/40' : ''}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">Verification
                {employer.status === 'verified' ? <Badge tone="teal">Verified {formatDate(employer.verified_at)}</Badge> : employer.status === 'pending' ? <Badge tone="amber">{employer.review_requested_at ? 'Asked for another review' : 'Waiting for verification'}</Badge>
                  : employer.status === 'rejected' ? <Badge tone="danger">Sent back for changes</Badge> : <Badge tone="danger">Paused</Badge>}</h2>
              <p className="mt-1 text-sm text-muted">Registered {formatDate(employer.created_at)}{employer.size ? ` · ${employer.size} people` : ''} · Team: {members.map((m) => `${m.full_name ?? m.email} (${m.role})`).join(', ') || 'none'}</p>
            </div>
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Verification checks">
            {verificationChecks(employer).map((c) => (
              <li key={c.key} className="flex items-start gap-2.5 rounded-xl border border-line bg-white p-3 text-sm">
                <span aria-hidden className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${c.ok === true ? 'bg-teal-700' : c.ok === false ? 'bg-danger' : 'bg-muted'}`}>{c.ok === true ? '✓' : c.ok === false ? '!' : '?'}</span>
                <span className="min-w-0"><b className="block">{c.label}<span className="sr-only">: {c.ok === true ? 'looks right' : c.ok === false ? 'needs checking' : 'cannot tell'}</span></b><span className="break-words text-muted">{c.detail}</span></span>
              </li>
            ))}
          </ul>
          {employer.review_note && employer.status !== 'verified' && <p className="mt-3 text-sm"><b>Last note to the employer{employer.reviewed_at ? ` (${formatDate(employer.reviewed_at)})` : ''}:</b> {employer.review_note}</p>}
          <p className="mt-3 text-sm text-muted">These are signals, not proof. Check the CAC public search or call the contact before verifying. Verified employers can post jobs, appear on the jobs board and search Passports open to employers.</p>
          <div className="mt-4"><EmployerReview id={employer.id} status={employer.status} /></div>
        </Card>
      )}
      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">Roles</h2>
        {roles.length === 0 ? <Card className="p-5 text-sm text-muted">No roles yet. Add the first one below.</Card> : (
          <div className="grid gap-3 md:grid-cols-2">
            {roles.map((r) => {
              const pay = payRange(r.pay_min, r.pay_max);
              return (
                <Link key={r.id} href={`/platform/talent/roles/${r.id}`}>
                  <Card className="h-full p-5 transition hover:border-blue/40 hover:shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display text-lg font-semibold">{r.title}</p>
                      <Badge tone={r.status === 'open' ? 'teal' : r.status === 'filled' ? 'violet' : r.status === 'draft' ? 'amber' : 'neutral'}>{r.status === 'open' ? 'Open' : r.status === 'filled' ? 'Filled' : r.status === 'draft' ? 'Draft' : 'Closed'}</Badge>
                    </div>
                    <p className="text-sm text-muted">{WORK_MODES[r.work_mode]} · {JOB_TYPES[r.job_type]}{r.state ? ` · ${r.state}` : ''} · {r.openings} {r.openings === 1 ? 'opening' : 'openings'}</p>
                    {pay && <p className="mt-1 text-sm font-semibold">{pay}</p>}
                    <p className="mt-3 text-sm text-muted"><b className="text-ink">{r.candidates}</b> put forward · <b className="text-ink">{r.confirmed}</b> interested · <b className="text-teal-700">{r.placed}</b> placed</p>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6"><h2 className="mb-4 text-lg font-semibold">Add a role</h2><RoleForm employerId={employer.id} skills={skills} /></Card>
        <Card className="p-5 sm:p-6"><h2 className="mb-4 text-lg font-semibold">Employer details</h2><EmployerForm id={employer.id} initial={employer} /></Card>
      </div>
    </TalentShell>
  );
}
