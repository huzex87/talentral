import Link from 'next/link';
import type { User } from '@talentral/db';
import { TalentralLogo } from './logo';
import { PlatformNav } from './platform-nav';
import { AccountMenu } from './account-menu';

// What the account menu needs to know about the signed-in person.
export function accountOf(user: User) {
  return { initial: (user.full_name?.trim()?.[0] ?? user.email?.[0] ?? '?').toUpperCase(), email: user.email, name: user.full_name };
}

// Header for signed-in areas, on midnight: logo, the area's own navigation (children), and the account menu.
export function TopBar({ user, signOutLabel = 'Sign out', children }: { user: User; signOutLabel?: string; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-midnight text-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span className="shrink-0"><TalentralLogo dark height={22} href="/dashboard" /></span>
          {children}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {user.is_platform_admin && (
            <Link href="/platform" className="hidden h-8 items-center rounded-md px-2.5 text-sm font-medium text-[#C3C9D9] transition-colors hover:bg-white/10 hover:text-white sm:inline-flex">Platform</Link>
          )}
          <AccountMenu {...accountOf(user)} tone="dark" signOutLabel={signOutLabel} extra={user.is_platform_admin ? [{ href: '/platform', label: 'Platform' }] : []} />
        </div>
      </div>
      {user.is_platform_admin && <PlatformNav />}
    </header>
  );
}
