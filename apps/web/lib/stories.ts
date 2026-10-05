import 'server-only';
import { withUser } from '@talentral/db';
import type { StoryMetric } from '@talentral/domain';

export type Story = {
  id: string; slug: string; tenant_id: string | null; hub_name: string | null; hub_slug: string | null; title: string; summary: string; body: string;
  metrics: StoryMetric[]; quote: string | null; quote_by: string | null; status: 'draft' | 'published'; consent_note: string | null; published_at: Date | null; updated_at: Date;
};

const COLUMNS = `s.id, s.slug, s.tenant_id, t.name as hub_name, t.slug as hub_slug, s.title, s.summary, s.body, s.metrics, s.quote, s.quote_by, s.status, s.consent_note, s.published_at, s.updated_at`;

// Published stories for the public pages (anyone), newest first.
export async function publishedStories(limit = 50): Promise<Story[]> {
  return withUser(null, (tx) => tx<Story[]>`
    select ${tx.unsafe(COLUMNS)} from public.case_studies s left join public.tenants t on t.id = s.tenant_id
    where s.status = 'published' order by s.published_at desc limit ${limit}`).catch(() => []);
}

export async function storyBySlug(slug: string): Promise<Story | null> {
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return null;
  const [s] = await withUser(null, (tx) => tx<Story[]>`
    select ${tx.unsafe(COLUMNS)} from public.case_studies s left join public.tenants t on t.id = s.tenant_id where s.slug = ${slug} and s.status = 'published'`);
  return s ?? null;
}

// Every story, for platform staff.
export async function allStories(userId: string): Promise<Story[]> {
  return withUser(userId, (tx) => tx<Story[]>`
    select ${tx.unsafe(COLUMNS)} from public.case_studies s left join public.tenants t on t.id = s.tenant_id order by s.status, s.updated_at desc`);
}
