import Link from 'next/link';
import { withUser, type User } from '@talentral/db';
import { accountOf } from './top-bar';
import { AccountMenu } from './account-menu';
import { AppTabBar, PageIn } from './app-tab-bar';
import { SECTION_TONE, learnerTabs, type LearnerSection } from './learner-tabs';
import { TalentralLogo } from './logo';
import { LanguageToggle } from './language-toggle';
import { PwaSetup } from './offline/pwa-setup';
import { cx } from './ui';

// Jobs the learner has been put forward or invited for and has not answered yet: the badge on the
// Jobs tab. A failed count never blocks the screen.
async function waitingReplies(userId: string): Promise<number> {
  try {
    const [row] = await withUser(userId, (tx) => tx<{ n: number }[]>`
      select count(*)::int as n from app.my_opportunities()
      where interest = 'pending' and withdrawn_at is null and coalesce(role_status, 'open') <> 'closed'`);
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}

// Frame for learners: their learning, their Passport, jobs, the reading language and offline support.
// Phones get an app bar and a bottom tab bar (the installed app's home); larger screens a header
// with tabs. `tabs={false}` hides the tab bar on phones for screens that bring their own bottom
// bar, such as a lesson's back, complete and next controls.
export async function LearnerShell({ user, language, active, tabs = true, children }: {
  user: User; language: 'en' | 'ha'; active: LearnerSection; tabs?: boolean; children: React.ReactNode;
}) {
  const ha = language === 'ha';
  const waiting = await waitingReplies(user.id);
  return (
    <div className="min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0" lang={language}>
      <header className="app-chrome sticky top-0 z-30 border-b border-white/[0.08] bg-midnight/95 pt-[env(safe-area-inset-top)] text-white backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-6">
            <span className="shrink-0"><TalentralLogo dark height={22} href="/learn" /></span>
            <nav className="hidden items-center gap-1 sm:flex" aria-label={ha ? 'Mai koyo' : 'Learner'}>
              {learnerTabs(language).map((t) => (
                <Link key={t.key} href={t.href} aria-current={active === t.key ? 'page' : undefined}
                  className={cx('relative inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
                    active === t.key ? 'bg-white/10 text-white' : 'text-[#C3C9D9] hover:bg-white/[0.06] hover:text-white')}>
                  {active === t.key && <span className={cx('size-1.5 rounded-full', SECTION_TONE[t.key].dot)} aria-hidden />}
                  {t.label}
                  {t.key === 'jobs' && waiting > 0 && <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold leading-[18px] text-white tabular-nums" aria-label={ha ? `${waiting} na jiran amsarka` : `${waiting} waiting for your reply`}>{waiting}</span>}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LanguageToggle language={language} tone="dark" compact />
            <AccountMenu {...accountOf(user)} tone="dark" signOutLabel={ha ? 'Fita' : 'Sign out'} accountLabel={ha ? 'Asusu da tsaro' : 'Account and security'}
              dataLabel={ha ? 'Bayananka' : 'Your data'} menuLabel={ha ? 'Menu na asusu' : 'Account menu'} />
          </div>
        </div>
        {/* The logo's gradient as a hairline under the app bar. */}
        <div className="brand-hairline absolute inset-x-0 bottom-0 h-px opacity-80" aria-hidden />
      </header>

      {tabs && <AppTabBar lang={language} active={active} badges={{ jobs: waiting }} />}

      <PwaSetup userId={user.id} lang={language} />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-12 pt-4 sm:px-6 md:pt-8"><PageIn>{children}</PageIn></main>
    </div>
  );
}
