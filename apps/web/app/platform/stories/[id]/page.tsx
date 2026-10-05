import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUpRight, ChevronLeft } from 'lucide-react';
import { withUser } from '@talentral/db';
import { storyMetricsText } from '@talentral/domain';
import { TopBar } from '@/components/top-bar';
import { Alert, Badge, Card, PageHeader, SectionHeader } from '@/components/ui';
import { requirePlatformAdmin } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { allStories } from '@/lib/stories';
import { PublishStory, StoryForm } from '../forms';

export const metadata = { title: 'Case study' };

export default async function StoryAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const user = await requirePlatformAdmin();
  const s = (await allStories(user.id)).find((x) => x.id === id);
  if (!s) notFound();
  const hubs = await withUser(user.id, (tx) => tx<{ id: string; name: string }[]>`select id, name from public.tenants order by name`);
  const published = s.status === 'published';
  return (
    <div className="min-h-dvh">
      <TopBar user={user} />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        <Link href="/platform/stories" className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-ink"><ChevronLeft className="size-4" aria-hidden />Case studies</Link>
        <PageHeader label={s.hub_name ?? 'Case study'} title={s.title}
          actions={published ? <Link href={`/stories/${s.slug}`} target="_blank" className="inline-flex items-center gap-1 text-sm font-medium text-ink underline decoration-line-strong underline-offset-4">View the story<ArrowUpRight className="size-4" aria-hidden /></Link> : undefined} />
        {created && <Alert tone="teal" title="Draft created. It stays private until you publish it." />}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="p-5 sm:p-6">
            <StoryForm id={s.id} hubs={hubs} initial={{ title: s.title, slug: s.slug, tenant_id: s.tenant_id ?? '', summary: s.summary, body: s.body, metrics: storyMetricsText(s.metrics), quote: s.quote ?? '', quote_by: s.quote_by ?? '' }} />
          </Card>
          <aside className="space-y-4">
            <SectionHeader title="Publication" />
            <Card className="space-y-4 p-5">
              <p className="flex items-center gap-2 text-sm">{published ? <Badge tone="teal">Published</Badge> : <Badge>Draft</Badge>}{s.published_at && <span className="text-muted">since {formatDate(s.published_at)}</span>}</p>
              {s.consent_note && <p className="text-sm text-muted"><span className="font-medium text-ink">Agreement:</span> {s.consent_note}</p>}
              <PublishStory id={s.id} published={published} />
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}
