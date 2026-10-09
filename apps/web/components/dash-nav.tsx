'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { hubSections, type SectionItem } from './hub-sections';
import { cx } from './ui';

type Item = SectionItem;
export type NavCounts = { toScore: number; toGrade: number };

// The hub's sections (see hub-sections.ts), with a count beside the queues that have work waiting.
export function DashNav({ slug, manage, counts }: { slug: string; manage: boolean; counts?: NavCounts }) {
  const path = usePathname();
  const groups = hubSections(slug, manage);
  const badge = (i: Item) => (i.count && counts ? counts[i.count] : 0);
  const isActive = (i: Item) => (i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`));

  return (
    <nav aria-label="Hub" className="min-w-0">
      {/* Phones and tablets: one scrollable row of tabs. */}
      <ul className="-mx-4 flex overflow-x-auto px-3 [scrollbar-width:none] sm:-mx-6 sm:px-5 lg:hidden">
        {groups.flatMap((g) => g.items).map((i) => {
          const active = isActive(i);
          return (
            <li key={i.href} className="shrink-0">
              <Link href={i.href} aria-current={active ? 'page' : undefined}
                className={cx('-mb-px flex h-11 items-center border-b-2 px-2.5 text-sm font-medium transition-colors',
                  active ? 'border-white text-white' : 'border-transparent text-[#AEB5C8] hover:text-white')}>
                {i.label}
                {badge(i) > 0 && <span className="ml-1.5 rounded-full bg-white/15 px-1.5 text-[11px] font-semibold tabular-nums text-white">{badge(i) > 99 ? '99+' : badge(i)}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Large screens: grouped list with icons. */}
      <div className="hidden space-y-5 lg:block">
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.title && <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8B93AB]">{g.title}</p>}
            <ul className="space-y-px">
              {g.items.map((i) => {
                const active = isActive(i);
                const Icon = i.icon;
                return (
                  <li key={i.href}>
                    <Link href={i.href} aria-current={active ? 'page' : undefined}
                      className={cx('group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
                        active ? 'bg-white/10 font-medium text-white shadow-[inset_2px_0_0_#5B7CFF]' : 'text-[#C3C9D9] hover:bg-white/[0.06] hover:text-white')}>
                      <Icon className={cx('size-4 shrink-0', active ? 'text-[#8FA8FF]' : 'text-[#7D86A0] group-hover:text-[#C3C9D9]')} aria-hidden strokeWidth={1.75} />
                      <span className="flex-1">{i.label}</span>
                      {badge(i) > 0 && <span className={cx('rounded-full px-1.5 text-[11px] font-semibold leading-[18px] tabular-nums', active ? 'bg-[#5B7CFF] text-white' : 'bg-white/10 text-[#DCE1EC]')} aria-label={`${badge(i)} waiting`}>{badge(i) > 99 ? '99+' : badge(i)}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
