'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './ui';

export function DashNav({ slug, manage }: { slug: string; manage: boolean }) {
  const path = usePathname();
  const base = `/dashboard/${slug}`;
  const items = [
    { href: base, label: 'Overview', exact: true },
    { href: `${base}/applications`, label: 'Applications' },
    { href: `${base}/cohorts`, label: 'Cohorts' },
    { href: `${base}/grading`, label: 'Grading' },
    ...(manage ? [
      { href: `${base}/courses`, label: 'Courses' },
      { href: `${base}/impact`, label: 'Impact' },
      { href: `${base}/messages`, label: 'Messages' },
      { href: `${base}/reports`, label: 'Reports' },
      { href: `${base}/programmes`, label: 'Programmes' },
      { href: `${base}/skills`, label: 'Skills' },
      { href: `${base}/profile`, label: 'Hub profile' },
      { href: `${base}/team`, label: 'Team' },
      { href: `${base}/audit`, label: 'Audit log' },
    ] : []),
  ];
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:flex-col lg:overflow-visible" aria-label="Hub">
      {items.map((i) => {
        const active = i.exact ? path === i.href : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? 'page' : undefined}
            className={cx('whitespace-nowrap rounded-[10px] px-3 py-2 text-[15px] font-semibold transition',
              active ? 'bg-blue-50 text-blue' : 'text-muted hover:bg-white hover:text-ink')}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
