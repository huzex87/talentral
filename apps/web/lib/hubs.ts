// Public reads for hub and programme pages. These run as the visitor (or anonymously), so
// Row-Level Security decides what is visible: members also see their own drafts.
import 'server-only';
import { cache } from 'react';
import { withUser, type Programme, type Tenant } from '@talentral/db';
import { currentUser } from './auth';

export const PUBLIC_HUB_COLUMNS = 'id, slug, name, tagline, description, logo_path, brand_color, website, contact_email, contact_phone, state, address, socials, status, profile_completed_at, created_at';

// A published learning path as the public sees it (MVP-2 month 9).
export interface HubPath { id: string; title: string; summary: string | null; outcome: string | null; courses: string[]; lessons: number; minutes: number }

export const publicHub = cache(async (slug: string) => {
  const user = await currentUser();
  return withUser(user?.id ?? null, async (tx) => {
    const [hub] = await tx<Tenant[]>`select ${tx.unsafe(PUBLIC_HUB_COLUMNS)} from public.tenants where slug = ${slug}`;
    if (!hub) return null;
    const programmes = await tx<Programme[]>`
      select * from public.programmes where tenant_id = ${hub.id}
      order by case status when 'open' then 0 when 'draft' then 1 else 2 end, closes_at nulls last, created_at desc`;
    const [m] = user ? await tx<{ role: string }[]>`select role from public.memberships where tenant_id = ${hub.id} and user_id = ${user.id}` : [];
    const paths = await tx<HubPath[]>`select id, title, summary, outcome, courses, lessons::int, minutes::int from app.hub_paths(${hub.id})`;
    return { hub, programmes, paths, isMember: Boolean(m) || Boolean(user?.is_platform_admin) };
  });
});

export const listedHubs = cache(async () =>
  withUser(null, (tx) => tx<(Tenant & { open_calls: number })[]>`
    select t.id, t.slug, t.name, t.tagline, t.logo_path, t.brand_color, t.state,
      (select count(*)::int from public.programmes p where p.tenant_id = t.id and p.status = 'open'
         and (p.opens_at is null or p.opens_at <= now()) and (p.closes_at is null or p.closes_at > now())) as open_calls
    from public.tenants t where t.status = 'active' and t.profile_completed_at is not null
    order by open_calls desc, t.name`));

export function logoUrl(hub: Pick<Tenant, 'slug' | 'logo_path'>): string | null {
  return hub.logo_path ? `/media/${hub.slug}/logo?v=${encodeURIComponent(hub.logo_path.slice(-12))}` : null;
}

// Partner logos are public wherever their programme is; the path suffix busts caches on change.
export function partnerLogoUrl(hubSlug: string, partner: { id: string; logo_path: string }): string {
  return `/media/${hubSlug}/partners/${partner.id}?v=${encodeURIComponent(partner.logo_path.slice(-12))}`;
}
