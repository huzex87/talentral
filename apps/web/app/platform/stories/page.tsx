import Link from 'next/link';
import { Newspaper } from 'lucide-react';
import { withUser } from '@talentral/db';
import { TopBar } from '@/components/top-bar';
import { Badge, Card, EmptyState, PageHeader, SectionHeader } from '@/components/ui';
import { requirePlatformAdmin } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { allStories } from '@/lib/stories';
import { StoryForm } from './forms';

export const metadata = { title: 'Case studies' };

export default async function StoriesAdmin() {
  const user = await requirePlatformAdmin();
  const [stories, hubs] = await Promise.all([allStories(user.id), withUser(user.id, (tx) => tx<{ id: string; name: string }[]>`select id, name from public.tenants order by name`)]);
  return (
    <div className="min-h-dvh">
      <TopBar user={user} />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        <PageHeader label="Talentral platform" title="Case studies"
          description="Stories from founding hubs, written with them and published on Talentral once they agree. Use only figures from the hub’s own reports." />
        <section aria-labelledby="stories-list">
          <SectionHeader id="stories-list" title="Stories" />
          {stories.length === 0 ? <EmptyState icon={Newspaper} title="No stories yet">Draft the first one below. It stays private until you publish it.</EmptyState> : (
            <Card className="divide-y divide-line">
              {stories.map((s) => (
                <Link key={s.id} href={`/platform/stories/${s.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-hover/60">
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{s.title}</span>
                    <span className="block text-sm text-muted">{s.hub_name ?? 'No hub'} · /stories/{s.slug}</span>
                  </span>
                  <span className="flex items-center gap-3 text-sm text-muted">
                    {s.published_at && <span>{formatDate(s.published_at)}</span>}
                    {s.status === 'published' ? <Badge tone="teal">Published</Badge> : <Badge>Draft</Badge>}
                  </span>
                </Link>
              ))}
            </Card>
          )}
        </section>
        <section aria-labelledby="new-story">
          <SectionHeader id="new-story" title="New story" />
          <Card className="p-5 sm:p-6"><StoryForm id={null} hubs={hubs} /></Card>
        </section>
      </main>
    </div>
  );
}
