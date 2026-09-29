import Link from 'next/link';
import type { User } from '@talentral/db';
import { TopBar } from './top-bar';
import { LanguageToggle } from './language-toggle';

// Frame for learners: their learning, their Passport, and the reading language.
export function LearnerShell({ user, language, active, children }: { user: User; language: 'en' | 'ha'; active: 'learn' | 'passport'; children: React.ReactNode }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} aria-current={on ? 'page' : undefined}
      className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-semibold transition ${on ? 'bg-blue-50 text-blue' : 'text-muted hover:text-ink'}`}>{label}</Link>
  );
  return (
    <div className="min-h-dvh">
      <TopBar user={user}>
        <nav className="flex items-center gap-1 border-l border-line pl-3" aria-label="Learner">
          {tab('/learn', language === 'ha' ? 'Karatuna' : 'My learning', active === 'learn')}
          {tab('/passport', 'Passport', active === 'passport')}
        </nav>
      </TopBar>
      <div className="mx-auto flex max-w-6xl justify-end px-4 pt-4 sm:px-6"><LanguageToggle language={language} /></div>
      <main className="mx-auto max-w-6xl px-4 pb-10 pt-2 sm:px-6">{children}</main>
    </div>
  );
}
