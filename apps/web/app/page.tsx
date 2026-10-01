import Link from 'next/link';
import { TalentralLogo } from '@/components/logo';
import { JoinForm } from '@/components/landing/join-form';
import { ProductPreview } from '@/components/landing/product-preview';
import { Badge, Card, LinkButton } from '@/components/ui';
import { listedHubs, logoUrl } from '@/lib/hubs';
import { hubPath } from '@/lib/urls';

export const dynamic = 'force-dynamic';

const STEPS = [
  ['Train', 'Cohort learning online and offline, in English and Hausa.', 'bg-violet'],
  ['Prove', 'Assessed work becomes verified evidence and credentials.', 'bg-[#5B49F2]'],
  ['Connect', 'Consented profiles matched to employer needs.', 'bg-blue'],
  ['Work', 'Interviews, placements and retention, tracked.', 'bg-teal-700'],
] as const;

// Stroke icons in the brand's line style; paths are 24x24.
const ICONS: Record<string, string> = {
  launch: 'M4 20h16M6 16l4-4 3 3 5-6M14 9h4v4',
  screen: 'M9 11l2 2 4-4M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
  message: 'M4 5h16v11H8l-4 4V5zM8 10h8M8 13h5',
  import: 'M12 3v12M7 10l5 5 5-5M4 19h16',
  report: 'M6 20V10M12 20V4M18 20v-6',
  brand: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z',
};

const FEATURES = [
  ['launch', 'Open a call in minutes', 'Your programme page and a mobile-first application form with the questions funders ask for, ready to share on WhatsApp.'],
  ['screen', 'Screen fairly at scale', 'A weighted rubric, independent reviewer scores and a ranked list. Shortlist hundreds in one action, with every decision logged.'],
  ['message', 'Keep applicants informed', 'Decision emails in your hub’s name and group messages by email and SMS, personalised with each applicant’s name and reference.'],
  ['import', 'Selection done elsewhere?', 'Import participants chosen on a funder’s platform from CSV or Excel. They join your cohort alongside everyone who applied here.'],
  ['report', 'Milestone evidence in one click', 'A funder-ready report on who applied and who was selected, by gender, age, disability and state, and how selection was done.'],
  ['brand', 'Your hub, your brand', 'Your own address such as kirkira.talentral.ng, with your logo and colours on every page and email.'],
] as const;

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

export default async function Home() {
  const hubs = await listedHubs();
  return (
    <main id="main" tabIndex={-1}>
      {/* Hero */}
      <section className="relative overflow-hidden bg-midnight text-white">
        <div className="brand-rule" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_85%_20%,rgba(124,58,237,0.25),transparent),radial-gradient(40%_40%_at_10%_90%,rgba(20,184,166,0.12),transparent)]" />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6 sm:pb-32 lg:pb-36">
          <header className="flex items-center justify-between gap-4">
            <TalentralLogo dark height={30} />
            <nav className="flex items-center gap-1 text-sm font-semibold">
              <a href="#hubs" className="hidden rounded-lg px-3 py-2 text-mist hover:text-white sm:block">For hubs</a>
              <a href="#programmes" className="hidden rounded-lg px-3 py-2 text-mist hover:text-white sm:block">Programmes</a>
              <Link href="/jobs" className="rounded-lg px-3 py-2 text-mist hover:text-white">Jobs</Link>
              <Link href="/employers" className="rounded-lg px-3 py-2 text-mist hover:text-white">For employers</Link>
              <Link href="/sign-in" className="rounded-lg px-3 py-2 text-mist hover:text-white">Sign in</Link>
            </nav>
          </header>
          <div className="mt-14 grid items-center gap-16 lg:mt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal">Skills-to-work platform</p>
              <h1 className="mt-4 text-4xl font-semibold leading-[1.06] sm:text-6xl">Verified skills.<br />Real work.</h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-mist">
                Apply to programmes run by innovation hubs across Northern Nigeria, learn in cohorts, prove what you can do and connect to employers.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <LinkButton href="#programmes">See open programmes</LinkButton>
                <LinkButton href="#hubs" variant="ghost" className="text-white ring-1 ring-white/20 hover:bg-white/10">I run a hub</LinkButton>
              </div>
              <p className="mt-8 text-sm text-mist/80">Built with Kirkira Innovation Hub for the iDICE Centre of Excellence.</p>
            </div>
            <div className="px-2 sm:px-8 lg:px-0"><ProductPreview /></div>
          </div>
        </div>
      </section>

      {/* Learner journey */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">For learners</p>
        <h2 className="mt-1 max-w-2xl text-3xl font-semibold">From application to a job, in one place</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, text, bg], i) => (
            <Card key={title} className="p-5">
              <span className={`inline-flex size-8 items-center justify-center rounded-full text-sm font-bold text-white ${bg}`}>{i + 1}</span>
              <h3 className="mt-4 text-xl font-semibold uppercase tracking-wide">{title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{text}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* For hubs */}
      <section id="hubs" className="scroll-mt-4 border-y border-line bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">For innovation hubs</p>
            <h2 className="mt-1 text-3xl font-semibold sm:text-4xl">Run your call for applications, selection and reporting without spreadsheets</h2>
            <p className="mt-3 text-lg text-muted">Talentral is built for hubs delivering funded skills programmes, with the evidence funders ask for kept as you go.</p>
          </div>
          <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([icon, title, text]) => (
              <div key={title}>
                <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue"><Icon name={icon} /></span>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{text}</p>
              </div>
            ))}
          </div>

          {/* Founding hub offer */}
          <div className="relative mt-16 overflow-hidden rounded-[var(--radius-card)] p-px">
            <div className="absolute inset-0 bg-[linear-gradient(120deg,#7C3AED,#2E5BFF,#14B8A6)]" />
            <div className="relative grid gap-8 rounded-[calc(var(--radius-card)-1px)] bg-midnight p-6 text-white sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div>
                <Badge tone="teal">Open to the first 10 hubs</Badge>
                <h3 className="mt-4 font-display text-3xl font-semibold">Become a founding hub</h3>
                <p className="mt-3 text-mist">Join the hubs shaping Talentral. We set you up, train your team and stay close while your first cohort runs.</p>
                <LinkButton href="#join" className="mt-6">Register interest</LinkButton>
              </div>
              <ul className="space-y-4">
                {[
                  ['50% off your first cohort', 'Founding hubs pay half the standard fee for their first cohort.'],
                  ['Pay after your cohort completes', 'No payment up front. You pay once the cohort is complete, in step with funder milestone payments.'],
                  ['Set-up and training included', 'Hub profile, first programme and team onboarding, done with you.'],
                  ['A say in what we build', 'Regular calls with the product team; founding hubs’ requests come first.'],
                ].map(([t, d]) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-teal text-[11px] font-bold text-midnight">✓</span>
                    <span><b className="block">{t}</b><span className="text-sm text-mist">{d}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Programmes */}
      <section id="programmes" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-16 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">Partner hubs</p>
        <h2 className="mt-1 text-3xl font-semibold">Find a programme</h2>
        {hubs.length === 0 ? (
          <Card className="mt-6 p-8 text-center">
            <p className="font-semibold">Founding hubs are setting up</p>
            <p className="mt-1 text-sm text-muted">The first calls for applications open soon. Follow your local hub for the announcement.</p>
          </Card>
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

      {/* Join */}
      <section id="join" className="scroll-mt-4 border-t border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:py-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">I run a hub</p>
            <h2 className="mt-1 text-3xl font-semibold">Bring your next cohort to Talentral</h2>
            <p className="mt-3 text-muted">Tell us about your hub. We will show you Talentral with your own programme and set you up as a founding hub.</p>
            <p className="mt-6 text-sm text-muted">Already a partner? <Link href="/sign-in" className="font-semibold text-blue hover:underline">Sign in</Link></p>
          </div>
          <Card className="p-5 sm:p-8"><JoinForm /></Card>
        </div>
      </section>

      <footer className="border-t border-line bg-canvas">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <TalentralLogo height={22} />
          <p>© {new Date().getFullYear()} Talentral · Founding partner: Kirkira Innovation Hub · iDICE Centre of Excellence</p>
        </div>
      </footer>
    </main>
  );
}
