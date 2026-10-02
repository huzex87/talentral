'use server';
// A hub's own domain and the look of its emails (MVP-2 month 9). Owners and admins only.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { withUser } from '@talentral/db';
import { domainProblem, normaliseDomain } from '@talentral/domain';
import { requireHubRole } from '@/lib/auth';
import { attachDomain, checkDomain, detachDomain } from '@/lib/domains';
import { env } from '@/lib/env';

export interface BrandingState { ok?: boolean; message?: string; errors?: Record<string, string> }

export async function saveDomain(slug: string, _prev: BrandingState, form: FormData): Promise<BrandingState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const domain = normaliseDomain(String(form.get('domain') ?? ''));
  const problem = domainProblem(domain, env.rootDomain || null);
  if (problem) return { errors: { domain: problem } };
  if (domain === hub.custom_domain) return { ok: true, message: 'That is already your domain.' };
  try {
    await withUser(user.id, (tx) => tx`select app.set_custom_domain(${hub.id}, ${domain})`);
  } catch (e) {
    return { errors: { domain: /Another hub/.test(e instanceof Error ? e.message : '') ? 'Another hub uses this domain.' : 'We could not save the domain. Please try again.' } };
  }
  if (hub.custom_domain) await detachDomain(hub.custom_domain);
  await attachDomain(domain);
  revalidatePath(`/dashboard/${slug}/branding`);
  return { ok: true, message: 'Saved. Add the two DNS records below, then check.' };
}

export async function checkDomainNow(slug: string): Promise<BrandingState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  if (!hub.custom_domain || !hub.domain_token) return { message: 'Add a domain first.' };
  const r = await checkDomain(hub.custom_domain, hub.domain_token);
  await withUser(user.id, (tx) => tx`select app.record_domain_check(${hub.id}, ${r.ok}, ${r.error})`);
  revalidatePath(`/dashboard/${slug}/branding`);
  return r.ok ? { ok: true, message: r.pointing ? 'Verified. Your domain is live.' : 'Verified. Once the CNAME record points to Talentral, your pages will load at your domain.' } : { message: r.error ?? 'Not verified yet.' };
}

export async function removeDomain(slug: string): Promise<void> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  if (!hub.custom_domain) return;
  await withUser(user.id, (tx) => tx`select app.set_custom_domain(${hub.id}, null)`);
  await detachDomain(hub.custom_domain);
  revalidatePath(`/dashboard/${slug}/branding`);
}

const emailSchema = z.object({
  email_from_name: z.string().trim().max(60).refine((v) => v === '' || (v.length >= 2 && !/[<>"@\r\n]/.test(v)), 'Use 2 to 60 characters, without < > " or @.'),
  email_reply_to: z.string().trim().toLowerCase().max(254).refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email address.'),
  email_footer: z.string().trim().max(300, 'Keep the footer under 300 characters.'),
});

export async function saveEmailBrand(slug: string, _prev: BrandingState, form: FormData): Promise<BrandingState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const parsed = emailSchema.safeParse(Object.fromEntries(Object.keys(emailSchema.shape).map((k) => [k, String(form.get(k) ?? '')])));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors };
  }
  const d = parsed.data;
  await withUser(user.id, (tx) => tx`update public.tenants set email_from_name = ${d.email_from_name || null}, email_reply_to = ${d.email_reply_to || null},
    email_footer = ${d.email_footer || null} where id = ${hub.id}`);
  revalidatePath(`/dashboard/${slug}/branding`);
  return { ok: true, message: 'Email settings saved.' };
}
