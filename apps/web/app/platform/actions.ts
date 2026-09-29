'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { withUser } from '@talentral/db';
import { slugProblem, slugify } from '@talentral/domain';
import { requirePlatformAdmin } from '@/lib/auth';
import { createInvite } from '@/lib/invites';

export interface CreateHubState { ok?: boolean; message?: string; errors?: Record<string, string> }

export async function createHub(_prev: CreateHubState, form: FormData): Promise<CreateHubState> {
  const user = await requirePlatformAdmin();
  const name = String(form.get('name') ?? '').trim();
  const slug = String(form.get('slug') ?? '').trim().toLowerCase() || slugify(name);
  const email = z.string().trim().toLowerCase().email().safeParse(form.get('owner_email'));
  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = 'Enter the hub name.';
  const sp = slugProblem(slug, { hub: true });
  if (sp) errors.slug = sp;
  if (!email.success) errors.owner_email = 'Enter the owner\'s email address.';
  if (Object.keys(errors).length) return { errors };
  let tenantId: string;
  try {
    const [row] = await withUser(user.id, (tx) => tx<{ id: string }[]>`insert into public.tenants (slug, name) values (${slug}, ${name}) returning id`);
    tenantId = row!.id;
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { errors: { slug: 'Another hub already uses this address.' } };
    throw e;
  }
  await createInvite({ userId: user.id, inviterName: user.full_name ?? 'The Talentral team', tenantId, hubName: name, email: email.data!, role: 'owner' });
  revalidatePath('/platform');
  return { ok: true, message: `${name} created. An owner invitation was sent to ${email.data}.` };
}

export async function resendOwnerInvite(tenantId: string, hubName: string, email: string) {
  const user = await requirePlatformAdmin();
  await createInvite({ userId: user.id, inviterName: user.full_name ?? 'The Talentral team', tenantId, hubName, email, role: 'owner' });
  revalidatePath('/platform');
}

export async function setHubStatus(tenantId: string, status: 'active' | 'suspended') {
  const user = await requirePlatformAdmin();
  await withUser(user.id, async (tx) => {
    await tx`update public.tenants set status = ${status} where id = ${tenantId}`;
    await tx`select app.audit(${tenantId}, 'hub.status', 'tenant', ${tenantId}, ${tx.json({ status })})`;
  });
  revalidatePath('/platform');
}

const LEAD_STATUSES = ['new', 'contacted', 'onboarded', 'declined'];

export async function setLeadStatus(id: string, status: string) {
  const user = await requirePlatformAdmin();
  if (!LEAD_STATUSES.includes(status) || !/^[0-9a-f-]{36}$/.test(id)) return;
  await withUser(user.id, (tx) => tx`update public.hub_leads set status = ${status} where id = ${id}`);
  revalidatePath('/platform');
}
