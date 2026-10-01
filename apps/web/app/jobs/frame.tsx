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
      <div className="brand-rule" />
      <header className="border-b border-line bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <TalentralLogo height={26} href="/" />
          <nav aria-label="Main" className="flex items-center gap-1 text-sm font-semibold">
            <Link href="/jobs" aria-current="page" className="rounded-lg bg-blue-50 px-3 py-2 text-blue">Jobs</Link>
            <Link href="/employers" className="hidden rounded-lg px-3 py-2 text-muted hover:text-ink sm:inline">For employers</Link>
            <Link href="/sign-in" className="rounded-lg px-3 py-2 text-muted hover:text-ink">Sign in</Link>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
