import Link from 'next/link';
import {
  ArrowRight, BadgeCheck, BriefcaseBusiness, Check, FileSpreadsheet, FileText, GraduationCap, Handshake, Megaphone,
  MessageSquareText, Palette, Scale,
} from 'lucide-react';
import { TalentralLogo } from '@/components/logo';
import { JoinForm } from '@/components/landing/join-form';
import { ProductPreview } from '@/components/landing/product-preview';
import { Badge, Card, LinkButton } from '@/components/ui';
import { listedHubs, logoUrl } from '@/lib/hubs';
import { hubPath } from '@/lib/urls';

export const dynamic = 'force-dynamic';

// The learner's way through Talentral. A real sequence, so it is numbered.
const STEPS = [
  { icon: GraduationCap, title: 'Train', text: 'Cohort learning online and offline, in English and Hausa.' },
  { icon: BadgeCheck, title: 'Prove', text: 'Assessed work becomes verified evidence and credentials.' },
  { icon: Handshake, title: 'Connect', text: 'Consented profiles matched to employer needs.' },
  { icon: BriefcaseBusiness, title: 'Work', text: 'Interviews, placements and retention, tracked.' },
];

const FEATURES = [
  { icon: Megaphone, title: 'Open a call in minutes', text: 'Your programme page and a mobile-first application form with the questions funders ask for, ready to share on WhatsApp.' },
  { icon: Scale, title: 'Screen fairly at scale', text: 'A weighted rubric, independent reviewer scores and a ranked list. Shortlist hundreds in one action, with every decision logged.' },
  { icon: MessageSquareText, title: 'Keep applicants informed', text: 'Decision emails in your hub’s name and group messages by email and SMS, personalised with each applicant’s name and reference.' },
  { icon: FileSpreadsheet, title: 'Selection done elsewhere?', text: 'Import participants chosen on a funder’s platform from CSV or Excel. They join your cohort alongside everyone who applied here.' },
  { icon: FileText, title: 'Milestone evidence in one click', text: 'A funder-ready report on who applied and who was selected, by gender, age, disability and state, and how selection was done.' },
  { icon: Palette, title: 'Your hub, your brand', text: 'Your own address such as kirkira.talentral.ng, with your logo and colours on every page and email.' },
];

const OFFER = [
  ['50% off your first cohort', 'Founding hubs pay half the standard fee for their first cohort.'],
  ['Pay after your cohort completes', 'No payment up front. You pay once the cohort is complete, in step with funder milestone payments.'],
  ['Set-up and training included', 'Hub profile, first programme and team onboarding, done with you.'],
  ['A say in what we build', 'Regular calls with the product team; founding hubs’ requests come first.'],
];

const navLink = 'rounded-md px-3 py-1.5 text-sm font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink';

export default async function Home() {
  const hubs = await listedHubs();
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <TalentralLogo height={24} />
          <nav aria-label="Main" className="flex items-center gap-0.5">
            <a href="#hubs" className={`${navLink} hidden md:block`}>For hubs</a>
            <a href="#programmes" className={`${navLink} hidden md:block`}>Programmes</a>
            <Link href="/jobs" className={`${navLink} hidden sm:block`}>Jobs</Link>
            <Link href="/employers" className={`${navLink} hidden sm:block`}>For employers</Link>
            <Link href="/sign-in" className={navLink}>Sign in</Link>
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-line bg-white">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--color-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-line)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_30%,transparent_100%)] opacity-60" />
          <div className="relative mx-auto max-w-6xl px-4 pt-16 sm:px-6 sm:pt-24">
            <div className="mx-auto max-w-3xl text-center">
              <p className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-[13px] font-medium text-ink-2 shadow-[var(--shadow-card)]">
                <span className="size-1.5 rounded-full bg-teal" aria-hidden />Skills-to-work platform for Northern Nigeria
              </p>
              <h1 className="mt-6 text-[44px] font-semibold leading-[1.02] tracking-[-0.045em] text-ink sm:text-7xl">
                Verified skills.<br /><span className="text-muted">Real work.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
                Apply to programmes run by innovation hubs, learn in cohorts, prove what you can do and connect to employers.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <LinkButton href="#programmes" className="h-11 px-5">See open programmes<ArrowRight aria-hidden /></LinkButton>
                <LinkButton href="#hubs" variant="secondary" className="h-11 px-5">I run a hub</LinkButton>
              </div>
              <p className="mt-6 text-[13px] text-muted">Built with Kirkira Innovation Hub for the iDICE Centre of Excellence.</p>
            </div>
            <div className="relative mx-auto mt-14 max-w-5xl sm:mt-16">
              <div className="-mb-px"><ProductPreview /></div>
            </div>
          </div>
        </section>

        {/* Learner journey */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24" aria-labelledby="journey">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-blue">For learners</p>
            <h2 id="journey" className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">From application to a job, in one place</h2>
          </div>
          <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="bg-white p-6">
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-canvas text-ink"><Icon className="size-[18px]" strokeWidth={1.75} aria-hidden /></span>
                  <span className="font-mono text-xs text-muted" aria-hidden>0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-base font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* For hubs */}
        <section id="hubs" className="scroll-mt-14 border-y border-line bg-white" aria-labelledby="for-hubs">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
            <div className="max-w-2xl">
              <p className="text-sm font-medium text-blue">For innovation hubs</p>
              <h2 id="for-hubs" className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Run your call for applications, selection and reporting without spreadsheets</h2>
              <p className="mt-4 text-lg leading-relaxed text-muted">Talentral is built for hubs delivering funded skills programmes, with the evidence funders ask for kept as you go.</p>
            </div>
            <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <div key={title} className="border-t border-line pt-6">
                  <Icon className="size-5 text-ink" strokeWidth={1.75} aria-hidden />
                  <h3 className="mt-4 text-base font-semibold">{title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{text}</p>
                </div>
              ))}
            </div>

            {/* Founding hub offer */}
            <div className="mt-20 grid gap-10 overflow-hidden rounded-xl bg-midnight p-8 text-white sm:p-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div>
                <p className="inline-flex items-center gap-2 text-[13px] font-medium text-teal"><span className="size-1.5 rounded-full bg-teal" aria-hidden />Open to the first 10 hubs</p>
                <h3 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">Become a founding hub</h3>
                <p className="mt-3 max-w-md leading-relaxed text-white/70">Join the hubs shaping Talentral. We set you up, train your team and stay close while your first cohort runs.</p>
                <LinkButton href="#join" variant="inverse" className="mt-8 h-11 px-5">Register interest<ArrowRight aria-hidden /></LinkButton>
              </div>
              <ul className="divide-y divide-white/10 border-y border-white/10">
                {OFFER.map(([t, d]) => (
                  <li key={t} className="flex gap-3 py-4">
                    <Check className="mt-0.5 size-4 shrink-0 text-teal" strokeWidth={2.5} aria-hidden />
                    <span><span className="block font-medium">{t}</span><span className="mt-0.5 block text-sm leading-relaxed text-white/65">{d}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Programmes */}
        <section id="programmes" className="mx-auto max-w-6xl scroll-mt-14 px-4 py-20 sm:px-6 sm:py-24" aria-labelledby="find">
          <p className="text-sm font-medium text-blue">Partner hubs</p>
          <h2 id="find" className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Find a programme</h2>
          {hubs.length === 0 ? (
            <Card className="mt-8 p-8 text-center">
              <p className="font-semibold">Founding hubs are setting up</p>
              <p className="mt-1 text-sm text-muted">The first calls for applications open soon. Follow your local hub for the announcement.</p>
            </Card>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {hubs.map((hub) => {
                const logo = logoUrl(hub);
                return (
                  <Link key={hub.id} href={hubPath(hub.slug)} className="group rounded-[var(--radius-card)]">
                    <Card className="flex h-full flex-col p-5 transition-[border-color,box-shadow] duration-200 group-hover:border-line-strong group-hover:shadow-[var(--shadow-pop)]">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-white">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {logo ? <img src={logo} alt="" className="size-full object-contain p-1.5" /> : <span className="text-lg font-semibold text-muted">{hub.name[0]}</span>}
                        </div>
                        <ArrowRight className="size-4 text-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
                      </div>
                      <h3 className="mt-4 truncate text-base font-semibold">{hub.name}</h3>
                      {hub.tagline && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{hub.tagline}</p>}
                      <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                        {hub.state && <Badge>{hub.state}</Badge>}
                        {hub.open_calls > 0 ? <Badge tone="teal">{hub.open_calls} open {hub.open_calls === 1 ? 'call' : 'calls'}</Badge> : <Badge>No open calls</Badge>}
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Join */}
        <section id="join" className="scroll-mt-14 border-t border-line bg-white" aria-labelledby="join-title">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <p className="text-sm font-medium text-blue">I run a hub</p>
              <h2 id="join-title" className="mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Bring your next cohort to Talentral</h2>
              <p className="mt-4 leading-relaxed text-muted">Tell us about your hub. We will show you Talentral with your own programme and set you up as a founding hub.</p>
              <p className="mt-6 text-sm text-muted">Already a partner? <Link href="/sign-in" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">Sign in</Link></p>
            </div>
            <Card className="p-5 sm:p-8"><JoinForm /></Card>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <TalentralLogo height={20} />
          <p>© {new Date().getFullYear()} Talentral · Founding partner: Kirkira Innovation Hub · iDICE Centre of Excellence</p>
        </div>
      </footer>
    </>
  );
}
