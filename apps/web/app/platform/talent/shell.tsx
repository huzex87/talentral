import Link from 'next/link';
import type { User } from '@talentral/db';
import { TopBar } from '@/components/top-bar';
import { cx } from '@/components/ui';

const TABS = [['search', 'Talent', '/platform/talent'], ['employers', 'Employers and roles', '/platform/talent/employers']] as const;

// Frame for the talent officer console.
export function TalentShell({ user, active, children }: { user: User; active: (typeof TABS)[number][0]; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <TopBar user={user} />
      <div className="border-b border-line bg-white">
        <nav aria-label="Talent console" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
          {TABS.map(([key, label, href]) => (
            <Link key={key} href={href} aria-current={active === key ? 'page' : undefined}
              className={cx('whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition', active === key ? 'border-violet text-violet' : 'border-transparent text-muted hover:text-ink')}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

export function Stat({ label, value, tone = 'ink' }: { label: string; value: number | string; tone?: 'ink' | 'teal' | 'violet' | 'blue' }) {
  const color = { ink: 'text-ink', teal: 'text-teal-700', violet: 'text-violet', blue: 'text-blue' }[tone];
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]">
      <p className={cx('font-display text-2xl font-semibold', color)}>{value}</p>
      <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
    </div>
  );
}
