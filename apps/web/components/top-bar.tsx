import Link from 'next/link';
import type { User } from '@talentral/db';
import { LogOut } from 'lucide-react';
import { TalentralLogo } from './logo';
import { PlatformNav } from './platform-nav';

// The person's initial in a quiet circle: the way into their account settings.
export function AccountAvatar({ user, className = '' }: { user: User; className?: string }) {
  const initial = (user.full_name?.trim()?.[0] ?? user.email?.[0] ?? '?').toUpperCase();
  return (
    <Link href="/account/security" aria-label="Account and security" title={user.email}
      className={`flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-canvas text-[13px] font-semibold text-ink-2 transition-colors hover:border-mist hover:bg-hover ${className}`}>
      {initial}
    </Link>
  );
}

export function SignOutButton({ label = 'Sign out', compact = false }: { label?: string; compact?: boolean }) {
  return (
    <form action="/sign-out" method="post">
      <button className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm font-medium text-muted transition-colors hover:bg-hover hover:text-ink">
        {!compact && <LogOut className="size-4" aria-hidden strokeWidth={1.75} />}{label}
      </button>
    </form>
  );
}

// Header for signed-in areas: logo, the area's own navigation (children), and the account.
export function TopBar({ user, signOutLabel = 'Sign out', children }: { user: User; signOutLabel?: string; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur-md supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span className="shrink-0"><TalentralLogo height={22} href="/dashboard" /></span>
          {children}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {user.is_platform_admin && (
            <Link href="/platform" className="hidden h-8 items-center rounded-md px-2.5 text-sm font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink sm:inline-flex">Platform</Link>
          )}
          <SignOutButton label={signOutLabel} compact />
          <AccountAvatar user={user} />
        </div>
      </div>
      {user.is_platform_admin && <PlatformNav />}
    </header>
  );
}
