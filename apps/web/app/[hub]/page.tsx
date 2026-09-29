import type { Metadata } from 'next';
import Link from 'next/link';
import { availability } from '@talentral/domain';
import { Badge, Card, cx } from '@/components/ui';
import { publicHub } from '@/lib/hubs';
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
  const { hub, programmes } = data;
  const socials = Object.entries(hub.socials ?? {}).filter(([, v]) => v);
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <section className="max-w-3xl">
        <h1 className="text-3xl font-semibold sm:text-4xl">{hub.name}</h1>
        {hub.tagline && <p className="mt-2 text-lg text-muted">{hub.tagline}</p>}
        {hub.description && <p className="mt-4 whitespace-pre-line leading-relaxed text-ink/90">{hub.description}</p>}
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {hub.state && <span className="text-muted">{hub.address ? `${hub.address}, ` : ''}{hub.state}</span>}
          {hub.website && <a href={hub.website} className="font-semibold text-blue hover:underline" rel="noopener noreferrer" target="_blank">Website</a>}
          {socials.map(([k, v]) => <a key={k} href={v} className="font-semibold capitalize text-blue hover:underline" rel="noopener noreferrer" target="_blank">{k}</a>)}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Programmes</h2>
        {programmes.length === 0 ? (
          <p className="mt-3 text-muted">No programmes yet. Check back soon.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {programmes.map((p) => {
              const a = availability(p);
              return (
                <Link key={p.id} href={hubPath(hub.slug, `/apply/${p.slug}`)} className="group">
                  <Card className={cx('flex h-full flex-col p-5 transition group-hover:border-[var(--hub)] group-hover:shadow-md', a === 'closed' && 'opacity-80')}>
                    <Badge tone={TONE[a]}>{LABEL[a]}</Badge>
                    <h3 className="mt-3 text-lg font-semibold group-hover:text-[var(--hub)]">{p.title}</h3>
                    {p.summary && <p className="mt-1 line-clamp-3 text-sm text-muted">{p.summary}</p>}
                    <p className="mt-auto pt-4 text-sm text-muted">
                      {a === 'not_yet_open' && p.opens_at ? `Opens ${formatDate(p.opens_at, true)}` : p.closes_at ? `${a === 'closed' ? 'Closed' : 'Closes'} ${formatDate(p.closes_at, true)}` : ''}
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
