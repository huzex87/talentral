import Link from 'next/link';
import { TalentralLogo } from '@/components/logo';
import { LinkButton, Card, Badge } from '@/components/ui';
import { listedHubs, logoUrl } from '@/lib/hubs';
import { hubPath } from '@/lib/urls';

export const dynamic = 'force-dynamic';

const STEPS = [
  ['Train', 'Cohort learning online and offline, in English and Hausa.', 'bg-violet'],
  ['Prove', 'Assessed work becomes verified evidence and credentials.', 'bg-[#5B49F2]'],
  ['Connect', 'Consented profiles matched to employer needs.', 'bg-blue'],
  ['Work', 'Interviews, placements and retention, tracked.', 'bg-teal-700'],
] as const;

export default async function Home() {
  const hubs = await listedHubs();
  return (
    <main>
      <section className="relative overflow-hidden bg-midnight text-white">
        <div className="brand-rule" />
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
          <header className="flex items-center justify-between">
            <TalentralLogo dark height={30} />
            <Link href="/sign-in" className="rounded-lg px-3 py-2 text-sm font-semibold text-mist hover:text-white">Hub sign in</Link>
          </header>
          <div className="mt-14 max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal">Skills-to-work platform</p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.08] sm:text-6xl">Verified skills.<br />Real work.</h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-mist">
              Apply to programmes run by innovation hubs across Northern Nigeria, learn in cohorts, prove what you can do and connect to employers.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="#programmes">See open programmes</LinkButton>
              <LinkButton href="/sign-in" variant="ghost" className="text-white hover:bg-white/10">I run a hub</LinkButton>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, text, bg], i) => (
            <Card key={title} className="p-5">
              <span className={`inline-flex size-8 items-center justify-center rounded-full text-sm font-bold text-white ${bg}`}>{i + 1}</span>
              <h2 className="mt-4 text-xl font-semibold uppercase tracking-wide">{title}</h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{text}</p>
            </Card>
          ))}
        </div>
      </section>

      <section id="programmes" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">Partner hubs</p>
        <h2 className="mt-1 text-3xl font-semibold">Find a programme</h2>
        {hubs.length === 0 ? (
          <p className="mt-4 text-muted">Partner hubs are setting up. Check back soon.</p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hubs.map((hub) => {
              const logo = logoUrl(hub);
              return (
                <Link key={hub.id} href={hubPath(hub.slug)} className="group">
                  <Card className="flex h-full items-start gap-4 p-5 transition group-hover:border-blue/40 group-hover:shadow-md">
                    <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white">
                      {logo ? <img src={logo} alt="" className="size-full object-contain p-1.5" /> : <span className="font-display text-xl font-semibold text-muted">{hub.name[0]}</span>}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold group-hover:text-blue">{hub.name}</h3>
                      {hub.tagline && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{hub.tagline}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {hub.state && <Badge>{hub.state}</Badge>}
                        {hub.open_calls > 0 ? <Badge tone="teal">{hub.open_calls} open {hub.open_calls === 1 ? 'call' : 'calls'}</Badge> : <Badge>No open calls</Badge>}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <TalentralLogo height={22} />
          <p>© {new Date().getFullYear()} Talentral · Founding partner: Kirkira Innovation Hub · iDICE Centre of Excellence</p>
        </div>
      </footer>
    </main>
  );
}
