'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SECTION_TONE, learnerTabs, sectionOf, type LearnerSection } from './learner-tabs';
import { cx } from './ui';

export type { LearnerSection };

// The installed app's home on phones: three tabs pinned above the home bar. A tap lights its tab
// at once (before the next screen arrives) with a short buzz where the phone supports it, so the
// app answers the finger the way native apps do. `badges` puts a count on a tab, for example
// jobs waiting for the learner's reply.
export function AppTabBar({ lang, active, badges = {} }: { lang: 'en' | 'ha'; active?: LearnerSection; badges?: Partial<Record<LearnerSection, number>> }) {
  const path = usePathname() ?? '';
  const [pressed, setPressed] = useState<LearnerSection | null>(null);
  useEffect(() => setPressed(null), [path]);
  const current = pressed ?? sectionOf(path) ?? active ?? null;
  const ha = lang === 'ha';

  return (
    <nav aria-label={ha ? 'Mai koyo' : 'Learner'}
      className="app-chrome fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.06] bg-white/85 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_-18px_rgba(16,24,40,0.28)] backdrop-blur-xl backdrop-saturate-150 sm:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-3 px-2">
        {learnerTabs(lang).map((t) => {
          const on = current === t.key;
          const Icon = t.icon;
          const badge = badges[t.key] ?? 0;
          return (
            <li key={t.key}>
              <Link href={t.href} aria-current={on ? 'page' : undefined}
                onClick={() => { if (!on) { setPressed(t.key); navigator.vibrate?.(8); } }}
                className="group flex h-16 flex-col items-center justify-center gap-1 outline-offset-[-4px]">
                <span className={cx('relative grid h-8 w-16 place-items-center rounded-full transition-[background-color,color,transform] duration-200 ease-out group-active:scale-90',
                  on ? SECTION_TONE[t.key].pill : 'text-muted')}>
                  <Icon className="size-[22px]" strokeWidth={on ? 2.2 : 1.8} aria-hidden />
                  {badge > 0 && (
                    <span className="absolute right-3 top-0 min-w-[18px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-[18px] text-white tabular-nums ring-2 ring-white" aria-hidden>{badge > 9 ? '9+' : badge}</span>
                  )}
                </span>
                <span className={cx('text-[11px] leading-none transition-colors', on ? 'font-semibold text-ink' : 'font-medium text-muted')}>
                  {t.label}
                  {badge > 0 && <span className="sr-only">{ha ? ` (${badge} na jiran amsarka)` : ` (${badge} waiting for your reply)`}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// A new screen slides into place when the path changes.
export function PageIn({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return <div key={path} className="page-in">{children}</div>;
}
