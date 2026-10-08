import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PublicFooter, PublicHeader } from '@/components/legal-page';
import { EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { publishedStories } from '@/lib/stories';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Stories', description: 'How founding hubs run their programmes on Talentral, in their own words and figures.' };

export default async function Stories() {
  const stories = await publishedStories();
  return (
    <>
      <PublicHeader width="max-w-5xl" />
      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-sm font-medium text-blue">Stories</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">How founding hubs run their programmes on Talentral</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">From the call for applications to learners in work, with the figures from each hub’s own reports.</p>
        {stories.length === 0 ? (
          <div className="mt-10"><EmptyState title="The first stories are on their way">Founding hubs are finishing their first cohorts. Their stories will appear here.</EmptyState></div>
        ) : (
          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {stories.map((s) => (
              <li key={s.id}>
                <Link href={`/stories/${s.slug}`} className="group flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-[var(--shadow-pop)]">
                  <span className="text-[13px] font-medium text-muted">{s.hub_name ?? 'Talentral'}{s.published_at ? ` · ${formatDate(s.published_at)}` : ''}</span>
                  <span className="mt-2 text-lg font-semibold tracking-[-0.015em] text-ink">{s.title}</span>
                  <span className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{s.summary}</span>
                  {s.metrics.length > 0 && (
                    <span className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
                      {s.metrics.slice(0, 2).map((m) => <span key={m.label}><span className="block text-xl font-semibold tabular-nums tracking-[-0.02em] text-ink">{m.value}</span><span className="block text-xs text-muted">{m.label}</span></span>)}
                    </span>
                  )}
                  <span className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-medium text-ink">Read the story<ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden /></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <PublicFooter width="max-w-5xl" />
    </>
  );
}
