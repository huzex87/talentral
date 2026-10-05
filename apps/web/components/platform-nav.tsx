'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './ui';

const ITEMS = [
  ['/platform', 'Hubs'], ['/platform/talent', 'Talent'], ['/platform/impact', 'Impact'], ['/platform/outcomes', 'Outcomes'],
  ['/platform/health', 'Health'], ['/platform/stories', 'Stories'], ['/platform/audit', 'Audit'], ['/platform/privacy', 'Privacy'],
] as const;

// Platform staff's sections, as tabs under the header. Shown only on platform pages.
export function PlatformNav() {
  const path = usePathname();
  if (!path.startsWith('/platform')) return null;
  return (
    <nav aria-label="Platform" className="border-t border-line">
      <ul className="mx-auto flex max-w-6xl overflow-x-auto px-3 [scrollbar-width:none] sm:px-5">
        {ITEMS.map(([href, label]) => {
          const active = href === '/platform' ? path === href || path.startsWith('/platform/support') : path === href || path.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0">
              <Link href={href} aria-current={active ? 'page' : undefined}
                className={cx('-mb-px flex h-11 items-center border-b-2 px-2.5 text-sm font-medium transition-colors', active ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink')}>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
