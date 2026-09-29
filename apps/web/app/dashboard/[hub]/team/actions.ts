'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { withUser } from '@talentral/db';
import { requireHubRole } from '@/lib/auth';
import { createInvite } from '@/lib/invites';

export interface TeamState { ok?: boolean; message?: string }

export async function invite(slug: string, _prev: TeamState, form: FormData): Promise<TeamState> {
  const { user, hub, role } = await requireHubRole(slug, ['owner', 'admin']);
  const email = z.string().trim().toLowerCase().email().safeParse(form.get('email'));
  const newRole = z.enum(['owner', 'admin', 'reviewer']).safeParse(form.get('role'));
  if (!email.success) return { message: 'Enter a valid email address.' };
  if (!newRole.success) return { message: 'Choose a role.' };
  if (newRole.data === 'owner' && role === 'admin') return { message: 'Only owners can invite owners.' };
  await createInvite({ userId: user.id, inviterName: user.full_name, tenantId: hub.id, hubName: hub.name, email: email.data, role: newRole.data });
  revalidatePath(`/dashboard/${slug}/team`);
  return { ok: true, message: `Invitation sent to ${email.data}.` };
}

export async function changeRole(slug: string, memberId: string, form: FormData) {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const role = z.enum(['owner', 'admin', 'reviewer']).parse(form.get('role'));
  await withUser(user.id, async (tx) => {
    await tx`update public.memberships set role = ${role} where tenant_id = ${hub.id} and user_id = ${memberId}`;
    await tx`select app.audit(${hub.id}, 'member.role_changed', 'user', ${memberId}, ${tx.json({ role })})`;
  });
  revalidatePath(`/dashboard/${slug}/team`);
}

export async function removeMember(slug: string, memberId: string) {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  await withUser(user.id, async (tx) => {
    await tx`delete from public.memberships where tenant_id = ${hub.id} and user_id = ${memberId}`;
    await tx`select app.audit(${hub.id}, 'member.removed', 'user', ${memberId})`;
  });
  revalidatePath(`/dashboard/${slug}/team`);
}

export async function cancelInvite(slug: string, inviteId: string) {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  await withUser(user.id, (tx) => tx`delete from public.invites where id = ${inviteId} and tenant_id = ${hub.id}`);
  revalidatePath(`/dashboard/${slug}/team`);
}
