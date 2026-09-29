import Link from 'next/link';
import { withUser } from '@talentral/db';
import { TopBar } from '@/components/top-bar';
import { Badge, Card, PageHeader } from '@/components/ui';
import { requirePlatformAdmin } from '@/lib/auth';
import { env } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { resendOwnerInvite, setHubStatus, setLeadStatus } from './actions';
import { CreateHubForm } from './create-hub-form';

export const metadata = { title: 'Platform' };

type HubRow = { id: string; slug: string; name: string; status: 'active' | 'suspended'; complete: boolean; created_at: Date;
  owners: number; pending_email: string | null; programmes: number; open_programmes: number; applications: number };

export default async function Platform() {
  const user = await requirePlatformAdmin();
  const hubs = await withUser(user.id, (tx) => tx<HubRow[]>`
    select t.id, t.slug, t.name, t.status, t.profile_completed_at is not null as complete, t.created_at,
      (select count(*)::int from public.memberships m where m.tenant_id = t.id and m.role = 'owner') as owners,
      (select i.email from public.invites i where i.tenant_id = t.id and i.role = 'owner' and i.accepted_at is null order by i.created_at desc limit 1) as pending_email,
      (select count(*)::int from public.programmes p where p.tenant_id = t.id) as programmes,
      (select count(*)::int from public.programmes p where p.tenant_id = t.id and p.status = 'open') as open_programmes,
      (select count(*)::int from public.applications a where a.tenant_id = t.id) as applications
    from public.tenants t order by t.created_at`);
  const leads = await withUser(user.id, (tx) => tx<{ id: string; hub_name: string; contact_name: string; email: string; phone: string; state: string | null; cohort_size: string | null; message: string | null; status: string; created_at: Date }[]>`
    select * from public.hub_leads order by (status = 'new') desc, created_at desc limit 100`);
  const totals = hubs.reduce((acc, h) => ({ apps: acc.apps + h.applications, ready: acc.ready + (h.complete ? 1 : 0) }), { apps: 0, ready: 0 });

  return (
    <div className="min-h-dvh">
      <TopBar user={user} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <PageHeader label="Talentral platform" title="Partner hubs" description={`${hubs.length} hubs · ${totals.ready} with complete profiles · ${totals.apps} applications in total.`} />
        {leads.length > 0 && (
          <Card className="overflow-hidden">
            <div className="flex items-baseline justify-between gap-3 px-5 pt-5">
              <h2 className="text-lg font-semibold">Hub enquiries</h2>
              <span className="text-sm text-muted">{leads.filter((l) => l.status === 'new').length} new · from the “I run a hub” form</span>
            </div>
            <ul className="mt-3 divide-y divide-line">
              {leads.map((l) => (
                <li key={l.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className="min-w-0">
                    <p className="font-semibold">{l.hub_name} {l.status === 'new' && <Badge tone="violet">New</Badge>}</p>
                    <p className="text-sm text-muted">{l.contact_name} · <a className="text-blue hover:underline" href={`mailto:${l.email}`}>{l.email}</a> · <a className="text-blue hover:underline" href={`tel:${l.phone}`}>{l.phone}</a>{l.state && ` · ${l.state}`}{l.cohort_size && ` · cohort ${l.cohort_size}`}</p>
                    {l.message && <p className="mt-1 text-sm">{l.message}</p>}
                    <p className="mt-1 text-xs text-muted">{formatDate(l.created_at, true)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {['contacted', 'onboarded', 'declined'].filter((s) => s !== l.status).map((s) => (
                      <form key={s} action={setLeadStatus.bind(null, l.id, s)}><button className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold capitalize text-muted hover:border-blue/40 hover:text-blue">{s}</button></form>
                    ))}
                    {l.status !== 'new' && <Badge tone={l.status === 'onboarded' ? 'teal' : l.status === 'declined' ? 'neutral' : 'blue'}>{l.status}</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold">Add a founding hub</h2>
          <CreateHubForm rootDomain={env.rootDomain} />
        </Card>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-line bg-canvas text-xs uppercase tracking-[0.08em] text-muted">
                <tr><th className="px-4 py-3">Hub</th><th className="px-4 py-3">Setup</th><th className="px-4 py-3">Programmes</th><th className="px-4 py-3">Applications</th><th className="px-4 py-3">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {hubs.map((h) => (
                  <tr key={h.id}>
                    <td className="px-4 py-3"><Link href={`/dashboard/${h.slug}`} className="font-semibold hover:text-blue">{h.name}</Link><p className="font-mono text-xs text-muted">{h.slug} · added {formatDate(h.created_at)}</p></td>
                    <td className="px-4 py-3 space-x-1">
                      {h.status === 'suspended' && <Badge tone="danger">Suspended</Badge>}
                      {h.owners === 0 ? <Badge tone="amber">Owner invited</Badge> : h.complete ? <Badge tone="teal">Profile complete</Badge> : <Badge tone="amber">Profile incomplete</Badge>}
                    </td>
                    <td className="px-4 py-3">{h.programmes} ({h.open_programmes} open)</td>
                    <td className="px-4 py-3 font-semibold">{h.applications}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {h.owners === 0 && h.pending_email && (
                          <form action={resendOwnerInvite.bind(null, h.id, h.name, h.pending_email)}><button className="rounded-lg px-2.5 py-1.5 font-semibold text-blue hover:bg-blue-50">Resend invite</button></form>
                        )}
                        <form action={setHubStatus.bind(null, h.id, h.status === 'active' ? 'suspended' : 'active')}>
                          <button className={`rounded-lg px-2.5 py-1.5 font-semibold ${h.status === 'active' ? 'text-danger hover:bg-danger-50' : 'text-teal-700 hover:bg-teal-50'}`}>{h.status === 'active' ? 'Suspend' : 'Reactivate'}</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}
