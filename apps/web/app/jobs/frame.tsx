import Link from 'next/link';
import type { User } from '@talentral/db';
import { LearnerShell } from '@/components/learner-shell';
import { TalentralLogo } from '@/components/logo';
import { TopBar } from '@/components/top-bar';

// Learners see the board inside their usual frame; everyone else gets a simple public header.
export function JobsFrame({ user, learner, lang, children }: { user: User | null; learner: boolean; lang: 'en' | 'ha'; children: React.ReactNode }) {
  if (user && learner) return <LearnerShell user={user} language={lang} active="jobs">{children}</LearnerShell>;
  if (user) {
    return (
      <div className="min-h-dvh">
        <TopBar user={user} />
        <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </div>
    );
  }
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <TalentralLogo height={22} href="/" />
          <nav aria-label="Main" className="flex items-center gap-1 text-sm font-medium">
            <Link href="/jobs" aria-current="page" className="rounded-md bg-hover px-3 py-1.5 text-ink">Jobs</Link>
            <Link href="/employers" className="hidden rounded-md px-3 py-1.5 text-muted transition-colors hover:text-ink sm:inline">For employers</Link>
            <Link href="/sign-in" className="rounded-md px-3 py-1.5 text-muted transition-colors hover:text-ink">Sign in</Link>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

// Find jobs and My applications, for learners.
export function JobsTabs({ active, applications, lang }: { active: 'find' | 'applications'; applications: number; lang: 'en' | 'ha' }) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const tab = (key: 'find' | 'applications', href: string, label: React.ReactNode) => (
    <Link href={href} aria-current={active === key ? 'page' : undefined}
      className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${active === key ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}>{label}</Link>
  );
  return (
    <nav aria-label={t('Jobs', 'Ayyuka')} className="mb-6 flex gap-1 border-b border-line">
      {tab('find', '/jobs', t('Find jobs', 'Nemi ayyuka'))}
      {tab('applications', '/jobs/applications', <>{t('My applications', 'Neman aikina')}{applications > 0 && <span className="rounded-md bg-hover px-1.5 py-px text-xs tabular-nums text-ink-2">{applications}</span>}</>)}
    </nav>
  );
}
