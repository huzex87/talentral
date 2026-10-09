import type { Metadata } from 'next';
import Link from 'next/link';
import { availability } from '@talentral/domain';
import { ArrowRight, Globe, MapPin } from 'lucide-react';
import { Badge, Card, cx } from '@/components/ui';
import { coverUrl, logoUrl, publicHub } from '@/lib/hubs';
import { HubPattern } from '@/components/hub-pattern';
import { formatDate } from '@/lib/format';
import { hubPath } from '@/lib/urls';

type Props = { params: Promise<{ hub: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await publicHub((await params).hub);
  return data ? { title: data.hub.name, description: data.hub.tagline ?? undefined } : {};
}

const LABEL = { open: 'Open for applications', not_yet_open: 'Opening soon', closed: 'Closed', draft: 'Draft (only your team can see this)' } as const;
const TONE = { open: 'teal', not_yet_open: 'amber', closed: 'neutral', draft: 'violet' } as const;

export default async function HubPage({ params }: Props) {
  const data = await publicHub((await params).hub);
  if (!data) return null;
  const { hub, programmes, paths, results } = data;
  const logo = logoUrl(hub);
  const cover = coverUrl(hub);
  const open = programmes.filter((p) => availability(p) === 'open').length;
  // Results show once there is something real to show: learners first, then outcomes.
  const figures = results.learners > 0 ? [
    { label: 'Learners trained', value: results.learners },
    { label: 'Certified', value: results.certified },
    { label: 'In work', value: results.placed },
  ] : [];
  const socials = Object.entries(hub.socials ?? {}).filter(([, v]) => v);
  return (
    <>
    <section className="border-b border-line bg-white">
      <div className="relative h-44 overflow-hidden bg-[var(--hub)] sm:h-64">
        {cover
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={cover} alt="" className="size-full object-cover" />
          : <HubPattern />}
        {cover && <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" aria-hidden />}
      </div>
      <div className="mx-auto max-w-5xl px-4 pb-10 sm:px-6 sm:pb-12">
        <div className="-mt-10 flex flex-col gap-5 sm:-mt-12 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white p-2 shadow-[var(--shadow-pop)] ring-4 ring-white sm:size-24">
              {logo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={logo} alt={`${hub.name} logo`} className="size-full object-contain" />
                : <span className="grid size-full place-items-center rounded-xl bg-[var(--hub)] font-display text-3xl font-semibold text-white" aria-hidden>{hub.name[0]}</span>}
            </span>
          </div>
          {open > 0 && <a href="#programmes" className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--hub)] px-5 text-sm font-medium text-white shadow-[0_1px_2px_rgba(16,24,40,0.1)] hover:brightness-95">{open === 1 ? 'See the open call' : `See ${open} open calls`}<ArrowRight className="size-4" aria-hidden /></a>}
        </div>
        <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold sm:text-[42px] sm:leading-[1.1]">{hub.name}</h1>
            {hub.tagline && <p className="mt-3 text-lg leading-relaxed text-ink-2">{hub.tagline}</p>}
            {hub.description && <p className="mt-4 whitespace-pre-line leading-relaxed text-muted">{hub.description}</p>}
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              {hub.state && <span className="inline-flex items-center gap-1.5 text-muted"><MapPin className="size-4" aria-hidden />{hub.address ? `${hub.address}, ` : ''}{hub.state}</span>}
              {hub.website && <a href={hub.website} className="inline-flex items-center gap-1.5 font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink" rel="noopener noreferrer" target="_blank"><Globe className="size-4 text-muted" aria-hidden />Website</a>}
              {socials.map(([k, v]) => <a key={k} href={v} className="font-medium capitalize text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink" rel="noopener noreferrer" target="_blank">{k}</a>)}
            </div>
          </div>
          {figures.length > 0 && (
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line lg:w-[22rem]" aria-label="Results so far">
              {figures.map((f) => (
                <div key={f.label} className="bg-white px-4 py-4">
                  <dt className="text-xs font-medium text-muted">{f.label}</dt>
                  <dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-ink">{f.value.toLocaleString('en-NG')}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </section>
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <section id="programmes" className="scroll-mt-20">
        <h2 className="text-2xl font-semibold">Programmes</h2>
        {programmes.length === 0 ? (
          <p className="mt-3 text-muted">No programmes yet. Check back soon.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {programmes.map((p) => {
              const a = availability(p);
              return (
                <Link key={p.id} href={hubPath(hub.slug, `/apply/${p.slug}`)} className="group rounded-[var(--radius-card)]">
                  <Card className={cx('flex h-full flex-col p-5 transition-[border-color,box-shadow] duration-200 group-hover:border-line-strong group-hover:shadow-[var(--shadow-pop)]', a === 'closed' && 'bg-canvas/60')}>
                    <Badge tone={TONE[a]}>{LABEL[a]}</Badge>
                    <h3 className="mt-3 text-lg font-semibold tracking-[-0.015em]">{p.title}</h3>
                    {p.summary && <p className="mt-1 line-clamp-3 text-sm text-muted">{p.summary}</p>}
                    <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm">
                      <span className="text-muted">{a === 'not_yet_open' && p.opens_at ? `Opens ${formatDate(p.opens_at, true)}` : p.closes_at ? `${a === 'closed' ? 'Closed' : 'Closes'} ${formatDate(p.closes_at, true)}` : ''}</span>
                      <span className="inline-flex shrink-0 items-center gap-1 font-medium text-ink">{a === 'open' ? 'Apply' : 'Details'}<ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden /></span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {paths.length > 0 && (
        <section className="mt-12" aria-labelledby="paths">
          <h2 id="paths" className="text-xl font-semibold tracking-[-0.02em]">Learning paths</h2>
          <p className="mt-1 text-muted">Courses in order, from your first lesson to a job-ready skill set.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {paths.map((p) => (
              <Card key={p.id} className="flex h-full flex-col p-5">
                {p.outcome && <p className="text-[13px] font-medium text-[var(--hub)]">Leads to: {p.outcome}</p>}
                <h3 className="mt-1 text-lg font-semibold">{p.title}</h3>
                {p.summary && <p className="mt-1 text-sm text-muted">{p.summary}</p>}
                <ol className="mt-4 space-y-2" aria-label={`Courses in ${p.title}`}>
                  {p.courses.map((c, i) => (
                    <li key={`${c}-${i}`} className="flex items-center gap-3 text-sm">
                      <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-canvas font-mono text-[11px] font-medium text-ink-2">{i + 1}</span>
                      <span className="font-medium">{c}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-auto pt-4 text-sm text-muted">{p.courses.length} {p.courses.length === 1 ? 'course' : 'courses'} · {p.lessons} lessons{p.minutes ? ` · about ${Math.max(1, Math.round(p.minutes / 60))} ${Math.max(1, Math.round(p.minutes / 60)) === 1 ? 'hour' : 'hours'}` : ''}</p>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
    </>
  );
}
