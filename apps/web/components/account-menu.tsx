'use client';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { cx } from './ui';

type Item = { href: string; label: string };

// The person's initial opens a small menu: account and security, their data, any extra links,
// and Sign out. Keeps Sign out out of the way in every header. `dark` sits on the midnight bars.
export function AccountMenu({ initial, email, name, tone = 'light', placement = 'down', signOutLabel = 'Sign out', accountLabel = 'Account and security',
  dataLabel = 'Your data', menuLabel = 'Account menu', extra = [], showEmail = false }: {
  initial: string; email: string; name?: string | null; tone?: 'light' | 'dark'; placement?: 'down' | 'up'; signOutLabel?: string; accountLabel?: string;
  dataLabel?: string; menuLabel?: string; extra?: Item[]; showEmail?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, [open]);

  const dark = tone === 'dark';
  const row = 'flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-ink-2 transition-colors hover:bg-hover hover:text-ink';
  return (
    <div ref={box} className={cx('relative', showEmail && 'min-w-0 flex-1')}>
      <button ref={button} type="button" aria-label={menuLabel} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
        className={cx('flex min-w-0 items-center gap-2 rounded-full transition-colors', showEmail && 'w-full rounded-lg p-1 pr-2', dark ? 'hover:bg-white/[0.06]' : 'hover:bg-hover')}>
        <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold',
          dark ? 'border-white/20 bg-white/10 text-white' : 'border-line-strong bg-canvas text-ink-2')} aria-hidden>{initial}</span>
        {showEmail && <span className={cx('min-w-0 flex-1 truncate text-left text-[13px]', dark ? 'text-[#AEB5C8]' : 'text-muted')}>{email}</span>}
      </button>
      {open && (
        <div id={id} className={cx('absolute z-50 w-64 rounded-[var(--radius-card)] border border-line bg-white p-1.5 text-ink shadow-[var(--shadow-pop)]',
          placement === 'up' ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2')}>
          <div className="border-b border-line px-2.5 pb-2.5 pt-1.5">
            {name && <p className="truncate text-sm font-semibold">{name}</p>}
            <p className="truncate text-[13px] text-muted">{email}</p>
          </div>
          <div className="space-y-px py-1.5">
            <Link href="/account/security" className={row} onClick={() => setOpen(false)}><ShieldCheck className="size-4 text-subtle" aria-hidden strokeWidth={1.75} />{accountLabel}</Link>
            <Link href="/account/privacy" className={row} onClick={() => setOpen(false)}><UserRound className="size-4 text-subtle" aria-hidden strokeWidth={1.75} />{dataLabel}</Link>
            {extra.map((i) => <Link key={i.href} href={i.href} className={row} onClick={() => setOpen(false)}><span className="size-4" aria-hidden />{i.label}</Link>)}
          </div>
          <form action="/sign-out" method="post" className="border-t border-line pt-1.5">
            <button className={row}><LogOut className="size-4 text-subtle" aria-hidden strokeWidth={1.75} />{signOutLabel}</button>
          </form>
        </div>
      )}
    </div>
  );
}
