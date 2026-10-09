import Link from 'next/link';
import type { User } from '@talentral/db';
import { LogOut } from 'lucide-react';
import { TalentralLogo } from './logo';
import { PlatformNav } from './platform-nav';
import { cx } from './ui';

type Tone = 'light' | 'dark';

// The person's initial in a quiet circle: the way into their account settings. `dark` sits on the
// midnight bars of signed-in areas.
export function AccountAvatar({ user, className = '', tone = 'light' }: { user: User; className?: string; tone?: Tone }) {
  const initial = (user.full_name?.trim()?.[0] ?? user.email?.[0] ?? '?').toUpperCase();
  return (
    <Link href="/account/security" aria-label="Account and security" title={user.email}
      className={cx('flex size-8 shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold transition-colors',
        tone === 'dark' ? 'border-white/20 bg-white/10 text-white hover:border-white/35 hover:bg-white/15' : 'border-line-strong bg-canvas text-ink-2 hover:border-mist hover:bg-hover',
        className)}>
      {initial}
    </Link>
  );
}

export function SignOutButton({ label = 'Sign out', compact = false, tone = 'light' }: { label?: string; compact?: boolean; tone?: Tone }) {
  return (
    <form action="/sign-out" method="post">
      <button className={cx('inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm font-medium transition-colors',
        tone === 'dark' ? 'text-[#C3C9D9] hover:bg-white/10 hover:text-white' : 'text-muted hover:bg-hover hover:text-ink')}>
        {!compact && <LogOut className="size-4" aria-hidden strokeWidth={1.75} />}{label}
      </button>
    </form>
  );
}

// Header for signed-in areas, on midnight: logo, the area's own navigation (children), and the account.
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
          <SignOutButton label={signOutLabel} compact tone="dark" />
          <AccountAvatar user={user} tone="dark" />
        </div>
      </div>
      {user.is_platform_admin && <PlatformNav />}
    </header>
  );
}
