import type { MetadataRoute } from 'next';
import { withUser } from '@talentral/db';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

// Public pages: the landing page, legal pages, the jobs board, every listed hub, its open calls,
// open jobs and published stories.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.appUrl;
  const rows = await withUser(null, async (tx) => ({
    hubs: await tx<{ slug: string; updated_at: Date }[]>`select slug, updated_at from public.tenants where status = 'active' and profile_completed_at is not null`,
    programmes: await tx<{ hub: string; slug: string; updated_at: Date }[]>`
      select t.slug as hub, p.slug, p.updated_at from public.programmes p join public.tenants t on t.id = p.tenant_id
      where t.status = 'active' and p.status = 'open' and (p.closes_at is null or p.closes_at > now())`,
    jobs: await tx<{ id: string }[]>`select id from app.job_board()`,
    stories: await tx<{ slug: string; published_at: Date }[]>`select slug, published_at from public.case_studies where status = 'published'`,
  })).catch(() => ({ hubs: [], programmes: [], jobs: [], stories: [] }));
  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/jobs`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/employers`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/stories`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    ...rows.hubs.map((h) => ({ url: `${base}/${h.slug}`, lastModified: h.updated_at, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...rows.programmes.map((p) => ({ url: `${base}/${p.hub}/apply/${p.slug}`, lastModified: p.updated_at, changeFrequency: 'daily' as const, priority: 0.8 })),
    ...rows.jobs.map((j) => ({ url: `${base}/jobs/${j.id}`, changeFrequency: 'daily' as const, priority: 0.6 })),
    ...rows.stories.map((s) => ({ url: `${base}/stories/${s.slug}`, lastModified: s.published_at, changeFrequency: 'monthly' as const, priority: 0.6 })),
  ];
}
