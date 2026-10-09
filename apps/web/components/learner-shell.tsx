import Link from 'next/link';
import type { User } from '@talentral/db';
import { BookOpen, BriefcaseBusiness, IdCard } from 'lucide-react';
import { accountOf } from './top-bar';
import { AccountMenu } from './account-menu';
import { TalentralLogo } from './logo';
import { LanguageToggle } from './language-toggle';
import { PwaSetup } from './offline/pwa-setup';
import { cx } from './ui';

type Section = 'learn' | 'passport' | 'jobs';

// Frame for learners: their learning, their Passport, jobs, the reading language and offline support.
// Phones get a bottom tab bar (the installed app's home), larger screens a header with tabs.
export function LearnerShell({ user, language, active, children }: { user: User; language: 'en' | 'ha'; active: Section; children: React.ReactNode }) {
  const ha = language === 'ha';
  const tabs: { key: Section; href: string; label: string; icon: typeof BookOpen }[] = [
    { key: 'learn', href: '/learn', label: ha ? 'Karatuna' : 'My learning', icon: BookOpen },
    { key: 'passport', href: '/passport', label: ha ? 'Fasfo' : 'Passport', icon: IdCard },
    { key: 'jobs', href: '/jobs', label: ha ? 'Ayyuka' : 'Jobs', icon: BriefcaseBusiness },
  ];
  return (
    <div className="min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0" lang={language}>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-midnight text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-6">
            <span className="shrink-0"><TalentralLogo dark height={22} href="/learn" /></span>
            <nav className="hidden items-center gap-1 sm:flex" aria-label={ha ? 'Mai koyo' : 'Learner'}>
              {tabs.map((t) => (
                <Link key={t.key} href={t.href} aria-current={active === t.key ? 'page' : undefined}
                  className={cx('inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors',
                    active === t.key ? 'bg-white/10 text-white' : 'text-[#C3C9D9] hover:bg-white/[0.06] hover:text-white')}>{t.label}</Link>
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageToggle language={language} tone="dark" compact />
            <AccountMenu {...accountOf(user)} tone="dark" signOutLabel={ha ? 'Fita' : 'Sign out'} accountLabel={ha ? 'Asusu da tsaro' : 'Account and security'}
              dataLabel={ha ? 'Bayananka' : 'Your data'} menuLabel={ha ? 'Menu na asusu' : 'Account menu'} />
          </div>
        </div>
      </header>

      {/* Bottom tab bar on phones. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden" aria-label={ha ? 'Mai koyo' : 'Learner'}>
        <ul className="grid grid-cols-3">
          {tabs.map((t) => {
            const on = active === t.key;
            const Icon = t.icon;
            return (
              <li key={t.key}>
                <Link href={t.href} aria-current={on ? 'page' : undefined}
                  className={cx('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors', on ? 'text-blue-600' : 'text-muted')}>
                  <Icon className="size-[22px]" strokeWidth={on ? 2.1 : 1.75} aria-hidden />
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <PwaSetup userId={user.id} lang={language} />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-12 pt-4 sm:px-6 md:pt-8">{children}</main>
    </div>
  );
}
