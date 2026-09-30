import Link from 'next/link';
import type { User } from '@talentral/db';
import { TalentralLogo } from './logo';

export function TopBar({ user, signOutLabel = 'Sign out', children }: { user: User; signOutLabel?: string; children?: React.ReactNode }) {
  return (
    <header className="border-b border-line bg-white">
      <div className="brand-rule" />
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <TalentralLogo height={24} href="/dashboard" />
          {children}
        </div>
        <div className="flex items-center gap-3 text-sm">
          {user.is_platform_admin && <>
            <Link href="/platform/talent" className="hidden font-semibold text-violet hover:underline sm:inline">Talent</Link>
            <Link href="/platform/impact" className="hidden font-semibold text-violet hover:underline sm:inline">Impact</Link>
            <Link href="/platform/audit" className="hidden font-semibold text-violet hover:underline sm:inline">Audit</Link>
            <Link href="/platform" className="hidden font-semibold text-violet hover:underline sm:inline">Platform</Link>
          </>}
          <Link href="/account/security" title="Account and security" className="hidden max-w-48 truncate text-muted hover:text-ink hover:underline md:inline">{user.email}</Link>
          <Link href="/account/security" aria-label="Account and security" className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink md:hidden">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" strokeLinecap="round" /></svg>
          </Link>
          <form action="/sign-out" method="post"><button className="whitespace-nowrap rounded-lg px-2.5 py-1.5 font-semibold text-muted hover:bg-canvas hover:text-ink">{signOutLabel}</button></form>
        </div>
      </div>
    </header>
  );
}
