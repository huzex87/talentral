'use server';
// Funders, partners and sponsors of a programme. Their logos appear on the public programme page
// and are frozen onto each certificate when it is issued, so logo files are never deleted here.
import { revalidatePath } from 'next/cache';
import { randomBytes } from 'node:crypto';
import { withUser } from '@talentral/db';
import { MAX_PARTNERS, PARTNER_ROLES } from '@talentral/domain';
import { requireHubRole } from '@/lib/auth';
import { extensionFor, matchesSignature } from '@/lib/files';
import { storage } from '@/lib/storage';

export interface PartnerState { ok?: boolean; message?: string; errors?: Record<string, string> }

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function refresh(slug: string, programmeId: string) {
  revalidatePath(`/dashboard/${slug}/programmes/${programmeId}`);
  revalidatePath(`/${slug}`, 'layout');
}

export async function addPartner(slug: string, programmeId: string, _prev: PartnerState, form: FormData): Promise<PartnerState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const name = String(form.get('name') ?? '').trim();
  const role = String(form.get('role') ?? 'partner');
  const logo = form.get('logo');
  const errors: Record<string, string> = {};
  if (name.length < 2 || name.length > 120) errors.name = 'Enter the organisation name.';
  if (!(role in PARTNER_ROLES)) errors.role = 'Choose a role.';
  let bytes: Uint8Array | null = null;
  if (!(logo instanceof File) || logo.size === 0) errors.logo = 'Add the organisation logo.';
  else {
    bytes = new Uint8Array(await logo.arrayBuffer());
    if (!LOGO_TYPES.includes(logo.type) || !matchesSignature(bytes, logo.type) || bytes.byteLength > 2 * 1024 * 1024) {
      errors.logo = 'Upload a PNG, JPEG or WebP image up to 2 MB.';
    }
  }
  if (Object.keys(errors).length) return { errors, message: 'Please check the highlighted fields.' };

  const [count] = await withUser(user.id, (tx) => tx<{ n: number; found: boolean }[]>`
    select (select count(*)::int from public.programme_partners where programme_id = ${programmeId}) as n,
           exists (select 1 from public.programmes where id = ${programmeId} and tenant_id = ${hub.id}) as found`);
  if (!count?.found) return { message: 'Programme not found.' };
  if (count.n >= MAX_PARTNERS) return { message: `A programme can show up to ${MAX_PARTNERS} partners. Remove one first.` };

  const type = (logo as File).type;
  const path = `tenants/${hub.id}/partners/${randomBytes(8).toString('hex')}.${extensionFor(type)}`;
  await (await storage()).put(path, bytes!, type);
  await withUser(user.id, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into public.programme_partners (tenant_id, programme_id, name, role, logo_path, position)
      values (${hub.id}, ${programmeId}, ${name}, ${role}, ${path},
              (select coalesce(max(position) + 1, 0) from public.programme_partners where programme_id = ${programmeId}))
      returning id`;
    await tx`select app.audit(${hub.id}, 'programme.partner_added', 'programme', ${programmeId}, ${tx.json({ partner: row!.id, name, role })})`;
  });
  refresh(slug, programmeId);
  return { ok: true, message: `${name} added. Certificates issued from now on show this logo.` };
}

export async function removePartner(slug: string, programmeId: string, partnerId: string): Promise<PartnerState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const rows = await withUser(user.id, async (tx) => {
    const r = await tx<{ name: string }[]>`delete from public.programme_partners
      where id = ${partnerId} and programme_id = ${programmeId} and tenant_id = ${hub.id} returning name`;
    if (r.length) await tx`select app.audit(${hub.id}, 'programme.partner_removed', 'programme', ${programmeId}, ${tx.json({ partner: partnerId, name: r[0]!.name })})`;
    return r;
  });
  refresh(slug, programmeId);
  return rows.length ? { ok: true, message: 'Partner removed. Certificates already issued keep their logos.' } : { message: 'Partner not found.' };
}

export async function movePartner(slug: string, programmeId: string, partnerId: string, direction: -1 | 1): Promise<PartnerState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  await withUser(user.id, async (tx) => {
    const list = await tx<{ id: string }[]>`select id from public.programme_partners
      where programme_id = ${programmeId} and tenant_id = ${hub.id} order by position, created_at for update`;
    const i = list.findIndex((p) => p.id === partnerId);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    for (const [position, p] of list.entries()) await tx`update public.programme_partners set position = ${position} where id = ${p.id}`;
  });
  refresh(slug, programmeId);
  return { ok: true };
}
