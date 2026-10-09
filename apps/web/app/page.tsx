import Link from 'next/link';
import {
  ArrowRight, BadgeCheck, BriefcaseBusiness, Check, FileSpreadsheet, FileText, GraduationCap, Handshake, Megaphone,
  MessageSquareText, Palette, QrCode, Scale, ShieldCheck, WifiOff,
} from 'lucide-react';
import { TalentralLogo } from '@/components/logo';
import { JoinForm } from '@/components/landing/join-form';
import { BrowserShot, PhoneShot } from '@/components/landing/screen';
import { HubPattern } from '@/components/hub-pattern';
import { DEMO_SLUG } from '@/lib/demo';
import { Badge, Card, LinkButton } from '@/components/ui';
import { coverUrl, listedHubs, logoUrl, platformResults } from '@/lib/hubs';
import { publishedStories } from '@/lib/stories';
import { hubPath } from '@/lib/urls';
import { buttonColor } from '@talentral/domain';

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
  ['Set-up and training, done with you', 'Your hub profile, first programme and team onboarding, in a working session with our team.'],
  ['Close support through your first cohort', 'A direct line to the Talentral team while your first cohort runs, from call to certificates.'],
  ['Funder evidence from day one', 'Milestone reports, attendance and outcomes kept as you go, ready when your funder asks.'],
  ['A say in what we build', 'Regular calls with the product team; founding hubs’ requests come first.'],
];

// The product, screen by screen. Every picture is a real screen from the demo academy.
const TOUR = [
  { src: '/landing/review.webp', url: 'talentral.ng/dashboard/applications', alt: 'Reviewing an application: answers, the scorecard, the decision panel and the position in the list',
    kicker: 'Select', title: 'Score hundreds of applicants fairly, and fast',
    points: ['A weighted rubric and independent reviewer scores', 'Review mode: next, previous and keyboard shortcuts', 'Shortlist and email in one step, every decision logged'] },
  { src: '/landing/course.webp', url: 'talentral.ng/dashboard/courses', alt: 'The course builder: modules and lessons in order, with an Add lesson menu',
    kicker: 'Teach', title: 'Build the course once, run it for every cohort',
    points: ['Reading, video, audio, PDF, quizzes and assignments', 'Drag lessons into order; English and Hausa side by side', 'Quizzes and assignments land in the gradebook'] },
  { src: '/landing/impact.webp', url: 'talentral.ng/dashboard/impact', alt: 'The impact dashboard: the journey from application to work and weekly attendance against the bar',
    kicker: 'Report', title: 'The numbers funders ask for, already counted',
    points: ['From application to paid work, by gender, state and disability', 'Excel exports and a printable funder report per cohort', 'Placements checked again at 90 days'] },
] as const;

const navLink = 'rounded-md px-3 py-1.5 text-sm font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink';

export default async function Home() {
  const [hubs, stories] = await Promise.all([listedHubs(), publishedStories(3)]);
  // The demo academy is sample data: listed for visitors to explore, never counted as results.
  const liveHubs = hubs.filter((h) => h.slug !== DEMO_SLUG);
  const results = await platformResults(liveHubs.map((h) => h.id));
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <TalentralLogo height={24} />
          <nav aria-label="Main" className="flex items-center gap-0.5">
            <a href="#hubs" className={`${navLink} hidden md:block`}>For hubs</a>
            <a href="#programmes" className={`${navLink} hidden md:block`}>Programmes</a>
            {stories.length > 0 && <Link href="/stories" className={`${navLink} hidden lg:block`}>Stories</Link>}
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
          <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 size-[36rem] rounded-full bg-[radial-gradient(circle,rgba(46,91,255,0.14),transparent_65%)]" />
          <div className="relative mx-auto max-w-6xl px-4 pt-14 sm:px-6 sm:pt-20">
            <div className="mx-auto max-w-3xl text-center">
              <p className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-[13px] font-medium text-ink-2 shadow-[var(--shadow-card)]">
                <span className="size-1.5 rounded-full bg-teal" aria-hidden />Skills-to-work platform for Northern Nigeria
              </p>
              <h1 className="mt-6 text-[44px] font-semibold leading-[1.02] tracking-[-0.03em] text-ink sm:text-7xl">
                Verified skills.<br /><span className="bg-[linear-gradient(90deg,#6D3FD9,#2E5BFF_55%,#14B8A6)] bg-clip-text text-transparent">Real work.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-ink-2">
                Innovation hubs run their calls, cohorts and funder reports on Talentral. Learners apply, study on their phones, prove what they can do and connect to employers.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <LinkButton href="#programmes" className="h-11 px-5">See open programmes<ArrowRight aria-hidden /></LinkButton>
                <LinkButton href="#hubs" variant="secondary" className="h-11 px-5">I run a hub</LinkButton>
              </div>
            </div>
            <div className="relative mx-auto mt-14 max-w-5xl pb-6 sm:mt-16 sm:pb-0">
              <BrowserShot priority src="/landing/overview.webp" width={1440} height={900} url="talentral.ng/dashboard"
                alt="A hub's overview: applicants, learners, attendance, completion, certificates and people in work, with what needs attention today" />
              <PhoneShot src="/landing/learn-phone.webp" width={780} height={1688} alt="A learner's home on a phone: course progress, the next class and a learning streak"
                className="absolute -bottom-2 -right-2 hidden w-[170px] sm:block lg:-right-10 lg:w-[210px]" />
            </div>
            <p className="pb-6 pt-4 text-center text-xs text-muted">Real screens from the Talentral demo academy. Names and figures are sample data.</p>
          </div>
        </section>

        {/* Proof: real figures once there are any, and how anyone can check a credential */}
        <section className="border-b border-line bg-canvas/60" aria-label="Proof">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            {results.learners > 0 ? (
              <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                {[['Partner hubs', liveHubs.length], ['Learners trained', results.learners], ['Certificates issued', results.certified], ['In work', results.placed]].map(([l, v]) => (
                  <div key={l as string}><dt className="text-[13px] font-medium text-muted">{l}</dt><dd className="mt-1 font-display text-3xl font-semibold tabular-nums">{(v as number).toLocaleString('en-NG')}</dd></div>
                ))}
              </dl>
            ) : (
              <div className="grid gap-6 sm:grid-cols-3">
                {[[ShieldCheck, 'Every certificate is verifiable', 'Scan the QR code or enter the serial at talentral.ng/verify.'], [WifiOff, 'Built for a phone and a small data plan', 'Lessons download on Wi-Fi and work offline.'], [QrCode, 'Attendance by QR code', 'Learners check in from their phones; registers fill themselves.']].map(([Icon, t, d]) => {
                  const I = Icon as typeof ShieldCheck;
                  return <div key={t as string} className="flex gap-3"><I className="mt-0.5 size-5 shrink-0 text-blue" strokeWidth={1.75} aria-hidden /><p><span className="block text-sm font-semibold">{t as string}</span><span className="block text-sm text-muted">{d as string}</span></p></div>;
                })}
              </div>
            )}
            <p className="text-sm text-muted lg:max-w-[16rem] lg:text-right">Built with <span className="font-semibold text-ink">Kirkira Innovation Hub</span> for the <span className="font-semibold text-ink">iDICE Centre of Excellence</span>, Katsina.</p>
          </div>
        </section>

        {/* Product tour */}
        <section className="mx-auto max-w-6xl space-y-20 px-4 py-20 sm:px-6 sm:py-24" aria-labelledby="tour">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-blue">The product</p>
            <h2 id="tour" className="mt-2 text-3xl font-semibold sm:text-4xl">One place for the whole programme</h2>
            <p className="mt-3 text-lg leading-relaxed text-muted">From the call for applications to the funder report. These are the screens hub teams use every day.</p>
          </div>
          {TOUR.map((t, i) => (
            <div key={t.src} className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className={i % 2 ? 'lg:order-2' : ''}>
                <p className="text-sm font-medium text-blue">{t.kicker}</p>
                <h3 className="mt-2 font-display text-2xl font-semibold sm:text-[28px]">{t.title}</h3>
                <ul className="mt-5 space-y-3">
                  {t.points.map((pt) => <li key={pt} className="flex gap-3 text-[15px] text-ink-2"><Check className="mt-0.5 size-4 shrink-0 text-teal-700" strokeWidth={2.5} aria-hidden />{pt}</li>)}
                </ul>
              </div>
              <BrowserShot src={t.src} url={t.url} width={1440} height={900} alt={t.alt} className={i % 2 ? 'lg:order-1' : ''} />
            </div>
          ))}
          <div className="grid items-center gap-10 overflow-hidden rounded-2xl bg-midnight px-6 pt-10 text-white sm:px-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:pt-0">
            <div className="lg:py-12">
              <p className="text-sm font-medium text-teal">Learn</p>
              <h3 className="mt-2 font-display text-2xl font-semibold sm:text-[28px]">Made for a phone, a small data plan and Hausa</h3>
              <ul className="mt-5 space-y-3 text-[15px] text-[#C3C9D9]">
                {['Sign in with a phone number, no password', 'Download lessons on Wi-Fi and study offline', 'English or Hausa on every learner screen', 'A Passport of verified skills employers can trust'].map((pt) => <li key={pt} className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-teal" strokeWidth={2.5} aria-hidden />{pt}</li>)}
              </ul>
            </div>
            <div className="flex justify-center gap-4 self-end">
              <PhoneShot src="/landing/learn-phone.webp" width={780} height={1688} alt="A learner's home: course progress, next class and streak" className="translate-y-10" />
              <PhoneShot src="/landing/passport-phone.webp" width={780} height={1688} alt="A learner's Talentral Passport with photo, readiness and completeness" className="hidden translate-y-20 sm:block" />
            </div>
          </div>
        </section>

        {/* Learner journey */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24" aria-labelledby="journey">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-blue">For learners</p>
            <h2 id="journey" className="mt-2 text-3xl font-semibold sm:text-4xl">From application to a job, in one place</h2>
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
              <h2 id="for-hubs" className="mt-2 text-3xl font-semibold sm:text-4xl">Run your call for applications, selection and reporting without spreadsheets</h2>
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

        {/* Stories from founding hubs, once any are published */}
        {stories.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 pt-20 sm:px-6 sm:pt-24" aria-labelledby="stories">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-blue">Stories</p>
                <h2 id="stories" className="mt-2 text-3xl font-semibold sm:text-4xl">From founding hubs</h2>
              </div>
              <Link href="/stories" className="inline-flex items-center gap-1 text-sm font-medium text-ink">All stories<ArrowRight className="size-4" aria-hidden /></Link>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {stories.map((st) => (
                <Link key={st.id} href={`/stories/${st.slug}`} className="group rounded-[var(--radius-card)]">
                  <Card className="flex h-full flex-col p-6 transition-[border-color,box-shadow] duration-200 group-hover:border-line-strong group-hover:shadow-[var(--shadow-pop)]">
                    <span className="text-[13px] font-medium text-muted">{st.hub_name ?? 'Talentral'}</span>
                    <span className="mt-2 text-base font-semibold text-ink">{st.title}</span>
                    {st.metrics[0] && <span className="mt-4 block"><span className="block text-2xl font-semibold tabular-nums tracking-[-0.03em]">{st.metrics[0].value}</span><span className="text-xs text-muted">{st.metrics[0].label}</span></span>}
                    <span className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-medium text-ink">Read the story<ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden /></span>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Programmes */}
        <section id="programmes" className="mx-auto max-w-6xl scroll-mt-14 px-4 py-20 sm:px-6 sm:py-24" aria-labelledby="find">
          <p className="text-sm font-medium text-blue">Partner hubs</p>
          <h2 id="find" className="mt-2 text-3xl font-semibold sm:text-4xl">Find a programme</h2>
          {hubs.length === 0 ? (
            <Card className="mt-8 p-8 text-center">
              <p className="font-semibold">Founding hubs are setting up</p>
              <p className="mt-1 text-sm text-muted">The first calls for applications open soon. Follow your local hub for the announcement.</p>
            </Card>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {hubs.map((hub) => {
                const logo = logoUrl(hub);
                const cover = coverUrl(hub);
                return (
                  <Link key={hub.id} href={hubPath(hub.slug)} className="group rounded-[var(--radius-card)]">
                    <Card className="flex h-full flex-col overflow-hidden transition-[border-color,box-shadow] duration-200 group-hover:border-line-strong group-hover:shadow-[var(--shadow-pop)]">
                      <div className="relative h-24 shrink-0" style={{ background: buttonColor(hub.brand_color) }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {cover ? <img src={cover} alt="" className="size-full object-cover" /> : <HubPattern />}
                      </div>
                      <div className="flex flex-1 flex-col px-5 pb-5">
                      <div className="-mt-7 flex items-end justify-between gap-4">
                        <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white shadow-[var(--shadow-card)]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {logo ? <img src={logo} alt="" className="size-full object-contain p-1.5" /> : <span className="text-lg font-semibold text-muted">{hub.name[0]}</span>}
                        </div>
                        <ArrowRight className="size-4 text-subtle transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
                      </div>
                      <h3 className="mt-3 truncate text-base font-semibold">{hub.name}</h3>
                      {hub.tagline && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{hub.tagline}</p>}
                      <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
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
        <section id="join" className="scroll-mt-14 border-t border-line bg-white" aria-labelledby="join-title">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <p className="text-sm font-medium text-blue">I run a hub</p>
              <h2 id="join-title" className="mt-2 text-3xl font-semibold sm:text-4xl">Bring your next cohort to Talentral</h2>
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
          <div className="flex flex-col gap-2 sm:items-end">
            <p>© {new Date().getFullYear()} Talentral · Founding partner: Kirkira Innovation Hub · iDICE Centre of Excellence</p>
            <p className="flex gap-4"><Link href="/stories" className="hover:text-ink">Stories</Link><Link href="/privacy" className="hover:text-ink">Privacy</Link><Link href="/terms" className="hover:text-ink">Terms</Link></p>
          </div>
        </div>
      </footer>
    </>
  );
}
