import { system, withUser } from '@talentral/db';
import { Badge, Card, PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { cancelInvite, changeRole, removeMember } from './actions';
import { InviteForm } from './invite-form';
import { TwoStepPolicy } from './two-step-policy';
import { ShieldCheck } from 'lucide-react';

export const metadata = { title: 'Team' };

const ROLES = {
  owner: 'Everything, including inviting owners',
  admin: 'Profile, programmes, team and applications',
  reviewer: 'Read and review applications',
};

export default async function TeamPage({ params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const { user, hub, role } = await requireHubRole(slug, ['owner', 'admin']);
  const { members, invites } = await withUser(user.id, async (tx) => ({
    members: await tx<{ id: string; email: string; full_name: string | null; role: keyof typeof ROLES; created_at: Date }[]>`
      select u.id, u.email, u.full_name, m.role, m.created_at from public.memberships m join public.users u on u.id = m.user_id
      where m.tenant_id = ${hub.id} order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, u.email`,
    invites: await tx<{ id: string; email: string; role: string; expires_at: Date }[]>`
      select id, email, role, expires_at from public.invites where tenant_id = ${hub.id} and accepted_at is null and expires_at > now() order by created_at desc`,
  }));
  const isOwner = role === 'owner' || role === 'platform';
  // Two-step status is system-only data; only whether it is on is shown here.
  const secured = new Set((await system()<{ user_id: string }[]>`
    select user_id from public.user_totp where enabled_at is not null and user_id = any(${members.map((m) => m.id)}::uuid[])`).map((r) => r.user_id));

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader label="Settings" title="Team" description="People who can manage your hub and review applications." />
      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold">Invite someone</h2>
        <InviteForm slug={hub.slug} canInviteOwner={isOwner} />
        <dl className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
          {Object.entries(ROLES).map(([r, d]) => <div key={r}><dt className="font-semibold capitalize">{r}</dt><dd className="text-muted">{d}</dd></div>)}
        </dl>
      </Card>

      <Card className="overflow-hidden">
        <h2 className="border-b border-line px-5 py-4 text-lg font-semibold">Members</h2>
        <ul className="divide-y divide-line">
          {members.map((m) => {
            const editable = m.id !== user.id && (isOwner || m.role !== 'owner');
            return (
              <li key={m.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{m.full_name ?? m.email}{m.id === user.id && <span className="font-normal text-muted"> (you)</span>}</p>
                  <p className="truncate text-sm text-muted">{m.email} · joined {formatDate(m.created_at)}</p>
                  {secured.has(m.id) ? <p className="mt-1 text-xs font-semibold text-teal-700"><ShieldCheck className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />Two-step sign-in on</p>
                    : hub.require_two_step && <p className="mt-1 text-xs font-semibold text-amber-800">Needs to set up two-step sign-in</p>}
                </div>
                {editable ? (
                  <div className="flex items-center gap-2">
                    <form action={changeRole.bind(null, hub.slug, m.id)} className="flex items-center gap-2">
                      <select name="role" defaultValue={m.role} className="h-9 rounded-lg border border-line bg-white px-2 text-sm" aria-label={`Role for ${m.email}`}>
                        {isOwner && <option value="owner">Owner</option>}<option value="admin">Admin</option><option value="reviewer">Reviewer</option>
                      </select>
                      <button className="h-9 rounded-lg px-3 text-sm font-semibold text-blue hover:bg-blue-50">Update</button>
                    </form>
                    <form action={removeMember.bind(null, hub.slug, m.id)}><button className="h-9 rounded-lg px-3 text-sm font-semibold text-danger hover:bg-danger-50">Remove</button></form>
                  </div>
                ) : <Badge tone="violet">{m.role}</Badge>}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="p-5 sm:p-6">
        <TwoStepPolicy slug={hub.slug} on={hub.require_two_step} canChange={isOwner} withTwoStep={secured.size} total={members.length} />
      </Card>

      {invites.length > 0 && (
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-5 py-4 text-lg font-semibold">Pending invitations</h2>
          <ul className="divide-y divide-line">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm">
                <span className="min-w-0 truncate"><b>{i.email}</b> · <span className="capitalize">{i.role}</span> · expires {formatDate(i.expires_at)}</span>
                <form action={cancelInvite.bind(null, hub.slug, i.id)}><button className="rounded-lg px-3 py-1.5 font-semibold text-danger hover:bg-danger-50">Cancel</button></form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
