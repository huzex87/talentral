import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { renderLessonText } from '@talentral/domain';
import { PublicFooter, PublicHeader } from '@/components/legal-page';
import { LinkButton } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { storyBySlug } from '@/lib/stories';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = await storyBySlug((await params).slug);
  return s ? { title: s.title, description: s.summary, openGraph: { title: s.title, description: s.summary } } : {};
}

export default async function Story({ params }: { params: Promise<{ slug: string }> }) {
  const s = await storyBySlug((await params).slug);
  if (!s) notFound();
  const html = renderLessonText(s.body);
  return (
    <>
      <PublicHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <Link href="/stories" className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-ink"><ChevronLeft className="size-4" aria-hidden />All stories</Link>
        <p className="mt-8 text-[13px] font-medium text-muted">{s.hub_name ?? 'Talentral'}{s.published_at ? ` · ${formatDate(s.published_at)}` : ''}</p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-[40px]">{s.title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-ink-2">{s.summary}</p>
        {s.metrics.length > 0 && (
          <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
            {s.metrics.map((m) => (
              <div key={m.label} className="flex flex-col-reverse bg-white p-5">
                <dt className="mt-1 text-[13px] text-muted">{m.label}</dt>
                <dd className="text-[28px] font-semibold leading-none tabular-nums tracking-[-0.03em]">{m.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {html && <article className="lesson-prose mt-10" dangerouslySetInnerHTML={{ __html: html }} />}
        {s.quote && (
          <figure className="mt-12 border-l-2 border-ink pl-5">
            <blockquote className="text-xl font-medium leading-relaxed tracking-[-0.01em] text-ink">“{s.quote}”</blockquote>
            {s.quote_by && <figcaption className="mt-3 text-sm text-muted">{s.quote_by}</figcaption>}
          </figure>
        )}
        <div className="mt-14 flex flex-wrap items-center gap-3 border-t border-line pt-8">
          {s.hub_slug && <LinkButton href={`/${s.hub_slug}`} variant="secondary">Visit {s.hub_name}</LinkButton>}
          <LinkButton href="/#join">Run your programme on Talentral</LinkButton>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
