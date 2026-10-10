'use server';
import { revalidatePath } from 'next/cache';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { withUser } from '@talentral/db';
import { NIGERIAN_STATES } from '@talentral/domain';
import { requireHubRole } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { extensionFor, matchesSignature } from '@/lib/files';

export interface ProfileState { ok?: boolean; errors?: Record<string, string>; message?: string }

const url = z.string().trim().max(300).refine((v) => v === '' || /^https?:\/\/\S+\.\S+/.test(v), 'Enter a full web address starting with https://');
const schema = z.object({
  name: z.string().trim().min(2, 'Enter your hub name.').max(120),
  tagline: z.string().trim().max(160),
  description: z.string().trim().max(2000),
  website: url,
  contact_email: z.string().trim().toLowerCase().max(160).refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email address.'),
  contact_phone: z.string().trim().max(30),
  state: z.string().refine((v) => v === '' || (NIGERIAN_STATES as readonly string[]).includes(v), 'Choose a state.'),
  address: z.string().trim().max(300),
  brand_color: z.string().trim().toUpperCase().refine((v) => v === '' || /^#[0-9A-F]{6}$/.test(v), 'Use a colour like #0F766E.'),
  linkedin: url, x: url, instagram: url, facebook: url,
});

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export async function saveProfile(slug: string, _prev: ProfileState, form: FormData): Promise<ProfileState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const raw = Object.fromEntries(['name', 'tagline', 'description', 'website', 'contact_email', 'contact_phone', 'state', 'address',
    'brand_color', 'linkedin', 'x', 'instagram', 'facebook'].map((k) => [k, String(form.get(k) ?? '')]));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors, message: 'Please check the highlighted fields.' };
  }
  const d = parsed.data;

  let logoPath = hub.logo_path;
  const logo = form.get('logo');
  if (logo instanceof File && logo.size > 0) {
    const bytes = new Uint8Array(await logo.arrayBuffer());
    if (!LOGO_TYPES.includes(logo.type) || !matchesSignature(bytes, logo.type) || bytes.byteLength > 2 * 1024 * 1024) {
      return { errors: { logo: 'Upload a PNG, JPEG or WebP image up to 2 MB.' } };
    }
    logoPath = `tenants/${hub.id}/logo-${randomBytes(6).toString('hex')}.${extensionFor(logo.type)}`;
    await (await storage()).put(logoPath, bytes, logo.type);
  }

  // The cover photo is optional; "remove_cover" clears it.
  let coverPath = hub.cover_path;
  const cover = form.get('cover');
  if (form.get('remove_cover') === '1') coverPath = null;
  else if (cover instanceof File && cover.size > 0) {
    const bytes = new Uint8Array(await cover.arrayBuffer());
    if (!LOGO_TYPES.includes(cover.type) || !matchesSignature(bytes, cover.type) || bytes.byteLength > 5 * 1024 * 1024) {
      return { errors: { cover: 'Upload a PNG, JPEG or WebP photo up to 5 MB.' } };
    }
    coverPath = `tenants/${hub.id}/cover-${randomBytes(6).toString('hex')}.${extensionFor(cover.type)}`;
    await (await storage()).put(coverPath, bytes, cover.type);
  }

  const socials = Object.fromEntries((['linkedin', 'x', 'instagram', 'facebook'] as const).filter((k) => d[k]).map((k) => [k, d[k]]));
  const complete = Boolean(d.name && d.tagline && d.description && d.contact_email && logoPath);
  await withUser(user.id, async (tx) => {
    await tx`update public.tenants set
      name = ${d.name}, tagline = ${d.tagline || null}, description = ${d.description || null}, website = ${d.website || null},
      contact_email = ${d.contact_email || null}, contact_phone = ${d.contact_phone || null}, state = ${d.state || null},
      address = ${d.address || null}, brand_color = ${d.brand_color || null}, logo_path = ${logoPath}, cover_path = ${coverPath}, socials = ${tx.json(socials)},
      profile_completed_at = ${complete ? (hub.profile_completed_at ?? new Date()) : null}
      where id = ${hub.id}`;
    await tx`select app.audit(${hub.id}, 'hub.profile_updated', 'tenant', ${hub.id}, ${tx.json({ complete })})`;
  });
  if (hub.logo_path && logoPath !== hub.logo_path) await (await storage()).remove(hub.logo_path).catch(() => {});
  if (hub.cover_path && coverPath !== hub.cover_path) await (await storage()).remove(hub.cover_path).catch(() => {});
  revalidatePath(`/dashboard/${slug}`, 'layout');
  revalidatePath(`/${slug}`, 'layout');
  return { ok: true, message: complete ? 'Profile saved. Your hub page is live.' : 'Saved. Add the remaining details to complete your profile.' };
}
