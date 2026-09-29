import type { Metadata } from 'next';
import Link from 'next/link';
import { TalentralLogo } from '@/components/logo';
import { Card } from '@/components/ui';
import { RegisterEmployerForm } from './register-form';

export const metadata: Metadata = {
  title: 'Hire verified talent',
  description: 'Post jobs and find people who have proven their skills in graded work at Talentral partner hubs across Nigeria.',
};

const STEPS = [
  ['Register', 'Tell us about your organisation. Our talent team verifies every employer before it can search, usually within one working day.'],
  ['Post a job', 'Describe the role, the skills it needs, how people will work and the pay range in naira.'],
  ['See ranked matches', 'Learners who chose to be found, ordered by fit, with the reasons: skills shown in graded work, certificates, availability.'],
  ['Invite and hire', 'Invite the people you like. When they say yes you get their contact details. Record the hire and a 90-day check.'],
] as const;

const PROOF = [
  ['Evidence, not just CVs', 'Skills are labelled self-declared or platform-evidenced. Evidenced skills come from graded work that met the pass mark.'],
  ['Certificates you can check', 'Every certificate has a number and QR code that anyone can verify at talentral.ng/verify.'],
  ['Consent built in', 'People appear only if they chose to be found by verified employers, and share contact details only when they say yes.'],
] as const;

export default function Employers() {
  return (
    <main className="min-h-dvh">
      <div className="brand-rule" />
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <TalentralLogo height={26} href="/" />
        <Link href="/sign-in" className="rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-white hover:text-ink">Employer sign in</Link>
      </header>

      <section className="relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(45%_60%_at_85%_10%,rgba(46,91,255,0.12),transparent),radial-gradient(40%_60%_at_5%_90%,rgba(20,184,166,0.10),transparent)]" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_480px] lg:items-start lg:pt-14">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet">Talentral for employers</p>
            <h1 className="mt-3 text-4xl font-semibold leading-[1.1] sm:text-5xl">Hire people who have <span className="bg-[linear-gradient(90deg,#7C3AED,#2E5BFF)] bg-clip-text text-transparent">proven their skills</span></h1>
            <p className="mt-4 max-w-xl text-lg text-muted">Find trained, assessed talent from innovation hubs across Nigeria. Every match shows why, and every certificate can be checked.</p>
            <ol className="mt-8 grid gap-3 sm:grid-cols-2">
              {STEPS.map(([title, body], i) => (
                <li key={title} className="rounded-2xl border border-line bg-white/80 p-4 backdrop-blur">
                  <p className="flex items-center gap-2 font-semibold"><span className="flex size-6 items-center justify-center rounded-full bg-blue text-xs font-bold text-white">{i + 1}</span>{title}</p>
                  <p className="mt-1.5 text-sm text-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
          <Card id="register" className="p-5 sm:p-7">
            <h2 className="font-display text-2xl font-semibold">Register your organisation</h2>
            <p className="mb-5 mt-1 text-sm text-muted">It takes two minutes. Registering, searching and inviting candidates have no charge during the pilot.</p>
            <RegisterEmployerForm />
          </Card>
        </div>
      </section>

      <section className="border-t border-line bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6 md:grid-cols-3">
          {PROOF.map(([title, body]) => (
            <div key={title}>
              <h3 className="font-display text-lg font-semibold">{title}</h3>
              <p className="mt-1.5 text-[15px] text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted sm:px-6">© Talentral · <Link href="/" className="hover:text-ink">For hubs</Link> · <Link href="/verify" className="hover:text-ink">Verify a certificate</Link></footer>
    </main>
  );
}
