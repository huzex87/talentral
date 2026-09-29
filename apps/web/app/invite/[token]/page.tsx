import { redirect } from 'next/navigation';
import { system } from '@talentral/db';
import { AuthShell } from '@/components/auth-shell';
import { Alert, Field, Input } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { startSession } from '@/lib/auth';
import { hashToken } from '@/lib/tokens';

export const metadata = { title: 'Accept invitation' };

interface Invite { id: string; tenant_id: string; email: string; role: 'owner' | 'admin' | 'reviewer'; hub_name: string; hub_slug: string; profile_completed_at: Date | null; full_name: string | null }

async function findInvite(token: string): Promise<Invite | null> {
  const [row] = await system()<Invite[]>`
    select i.id, i.tenant_id, i.email, i.role, t.name as hub_name, t.slug as hub_slug, t.profile_completed_at,
      (select u.full_name from public.users u where u.email = i.email) as full_name
    from public.invites i join public.tenants t on t.id = i.tenant_id
    where i.token_hash = ${hashToken(token)} and i.accepted_at is null and i.expires_at > now()`;
  return row ?? null;
}

const RANK = { reviewer: 1, admin: 2, owner: 3 } as const;

async function accept(token: string, form: FormData) {
  'use server';
  const name = String(form.get('full_name') ?? '').trim().slice(0, 120);
  if (name.length < 3) redirect(`/invite/${encodeURIComponent(token)}?error=name`);
  const result = await system().begin(async (tx) => {
    const [inv] = await tx<Invite[]>`
      select i.id, i.tenant_id, i.email, i.role, t.slug as hub_slug, t.profile_completed_at
      from public.invites i join public.tenants t on t.id = i.tenant_id
      where i.token_hash = ${hashToken(token)} and i.accepted_at is null and i.expires_at > now() for update of i`;
    if (!inv) return null;
    const [user] = await tx<{ id: string }[]>`
      insert into public.users (email, full_name) values (${inv.email}, ${name})
      on conflict (email) do update set full_name = coalesce(public.users.full_name, excluded.full_name), last_sign_in_at = now()
      returning id`;
    const [existing] = await tx<{ role: keyof typeof RANK }[]>`select role from public.memberships where tenant_id = ${inv.tenant_id} and user_id = ${user!.id}`;
    if (!existing) {
      await tx`insert into public.memberships (tenant_id, user_id, role) values (${inv.tenant_id}, ${user!.id}, ${inv.role})`;
    } else if (RANK[inv.role] > RANK[existing.role]) {
      await tx`update public.memberships set role = ${inv.role} where tenant_id = ${inv.tenant_id} and user_id = ${user!.id}`;
    }
    await tx`update public.invites set accepted_at = now() where id = ${inv.id}`;
    await tx`insert into public.audit_log (tenant_id, actor_id, action, target_type, target_id, metadata)
             values (${inv.tenant_id}, ${user!.id}, 'member.joined', 'user', ${user!.id}, ${tx.json({ role: inv.role })})`;
    return { userId: user!.id, slug: inv.hub_slug, owner: inv.role === 'owner', complete: Boolean(inv.profile_completed_at) };
  });
  if (!result) redirect(`/invite/${encodeURIComponent(token)}`);
  await startSession(result.userId);
  redirect(result.owner && !result.complete ? `/dashboard/${result.slug}/profile?welcome=1` : `/dashboard/${result.slug}`);
}

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const invite = await findInvite(token);
  if (!invite) {
    return (
      <AuthShell title="Invitation not available">
        <Alert tone="amber">This invitation has expired or has already been used. Ask your hub owner to send a new one, or <a className="font-semibold underline" href="/sign-in">sign in</a>.</Alert>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={`Join ${invite.hub_name}`} subtitle={`You have been invited as ${invite.role === 'owner' ? 'an owner' : `a ${invite.role}`}, using ${invite.email}.`}>
      <form action={accept.bind(null, token)} className="space-y-5">
        <Field label="Your full name" htmlFor="full_name" error={error === 'name' ? 'Enter your full name.' : null}>
          <Input id="full_name" name="full_name" autoComplete="name" defaultValue={invite.full_name ?? ''} required autoFocus />
        </Field>
        <SubmitButton className="w-full" pendingLabel="Joining…">Accept and continue</SubmitButton>
      </form>
    </AuthShell>
  );
}
