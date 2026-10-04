'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity, BarChart3, BookOpen, Building2, ClipboardCheck, FileText, Globe, Inbox, LayoutGrid, Megaphone,
  Route, ScrollText, Send, Tags, Target, Users, UsersRound, type LucideIcon,
} from 'lucide-react';
import { cx } from './ui';

type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean };

// The hub's sections, grouped by the job they do. Staff who only review see the first group.
export function DashNav({ slug, manage }: { slug: string; manage: boolean }) {
  const path = usePathname();
  const base = `/dashboard/${slug}`;
  const groups: { title?: string; items: Item[] }[] = [
    { items: [
      { href: base, label: 'Overview', icon: LayoutGrid, exact: true },
      { href: `${base}/applications`, label: 'Applications', icon: Inbox },
      { href: `${base}/cohorts`, label: 'Cohorts', icon: Users },
      { href: `${base}/grading`, label: 'Grading', icon: ClipboardCheck },
    ] },
    ...(manage ? [
      { title: 'Teaching', items: [
        { href: `${base}/programmes`, label: 'Programmes', icon: Megaphone },
        { href: `${base}/courses`, label: 'Courses', icon: BookOpen },
        { href: `${base}/paths`, label: 'Learning paths', icon: Route },
        { href: `${base}/skills`, label: 'Skills', icon: Tags },
        { href: `${base}/messages`, label: 'Messages', icon: Send },
      ] },
      { title: 'Results', items: [
        { href: `${base}/impact`, label: 'Impact', icon: BarChart3 },
        { href: `${base}/outcomes`, label: 'Pilot outcomes', icon: Target },
        { href: `${base}/health`, label: 'Pilot health', icon: Activity },
        { href: `${base}/reports`, label: 'Reports', icon: FileText },
      ] },
      { title: 'Settings', items: [
        { href: `${base}/profile`, label: 'Hub profile', icon: Building2 },
        { href: `${base}/branding`, label: 'Domain and emails', icon: Globe },
        { href: `${base}/team`, label: 'Team', icon: UsersRound },
        { href: `${base}/audit`, label: 'Audit log', icon: ScrollText },
      ] },
    ] : []),
  ];
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
                  active ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink')}>
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Large screens: grouped list with icons. */}
      <div className="hidden space-y-5 lg:block">
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.title && <p className="mb-1 px-2.5 text-xs font-medium text-muted">{g.title}</p>}
            <ul className="space-y-px">
              {g.items.map((i) => {
                const active = isActive(i);
                const Icon = i.icon;
                return (
                  <li key={i.href}>
                    <Link href={i.href} aria-current={active ? 'page' : undefined}
                      className={cx('group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
                        active ? 'bg-hover font-medium text-ink' : 'text-ink-2 hover:bg-hover/70 hover:text-ink')}>
                      <Icon className={cx('size-4 shrink-0', active ? 'text-ink' : 'text-subtle group-hover:text-muted')} aria-hidden strokeWidth={1.75} />
                      {i.label}
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
