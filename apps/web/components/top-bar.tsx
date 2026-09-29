import Link from 'next/link';
import type { User } from '@talentral/db';
import { TalentralLogo } from './logo';

export function TopBar({ user, children }: { user: User; children?: React.ReactNode }) {
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
            <Link href="/platform" className="hidden font-semibold text-violet hover:underline sm:inline">Platform</Link>
          </>}
          <span className="hidden max-w-48 truncate text-muted md:inline">{user.email}</span>
          <form action="/sign-out" method="post"><button className="whitespace-nowrap rounded-lg px-2.5 py-1.5 font-semibold text-muted hover:bg-canvas hover:text-ink">Sign out</button></form>
        </div>
      </div>
    </header>
  );
}
