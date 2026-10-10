'use client';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { Bell, CalendarClock, ClipboardCheck, Clock3, Inbox, Moon, UserPlus, type LucideIcon } from 'lucide-react';
import { markInboxSeen, setWeeklyDigest } from '@/app/dashboard/[hub]/inbox/actions';
import { cx } from './ui';

export interface BellItem { key: string; kind: string; title: string; detail: string; href: string; unread: boolean }

const ICONS: Record<string, LucideIcon> = { applications: Inbox, grading: ClipboardCheck, inactive: Moon, class: CalendarClock, admit: UserPlus, closing: Clock3 };

// The hub team's notifications: a bell with the count of new items, and a panel listing what needs
// doing with a link to each. Opening it marks the items seen. The weekly summary email is switched
// on or off from the same panel.
export function InboxBell({ slug, items, digest, placement = 'down' }: { slug: string; items: BellItem[]; digest: boolean | null; placement?: 'down' | 'right' }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(items.filter((i) => i.unread).length);
  const [weekly, setWeekly] = useState(digest);
  const [pending, start] = useTransition();
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

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread) { setUnread(0); void markInboxSeen(slug); }
  };

  return (
    <div ref={box} className="relative">
      <button ref={button} type="button" onClick={toggle} aria-expanded={open} aria-controls={id}
        aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
        className="relative grid size-8 place-items-center rounded-md text-[#C3C9D9] transition-colors hover:bg-white/[0.08] hover:text-white">
        <Bell className="size-[18px]" strokeWidth={1.75} aria-hidden />
        {unread > 0 && <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#FF5C5C] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-midnight" aria-hidden>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div id={id} role="dialog" aria-label="Notifications"
          className={cx('absolute z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-card)] border border-line bg-white text-ink shadow-[var(--shadow-pop)]',
            placement === 'right' ? 'left-full top-0 ml-3' : 'right-0 top-full mt-2')}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-display text-base font-semibold">Needs your attention</p>
            <span className="text-xs text-muted">{items.length ? `${items.length} ${items.length === 1 ? 'item' : 'items'}` : ''}</span>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">All clear. New applications, work to grade and learners who go quiet show here.</p>
          ) : (
            <ul className="max-h-[60dvh] divide-y divide-line overflow-y-auto">
              {items.map((i) => {
                const Icon = ICONS[i.kind] ?? Inbox;
                return (
                  <li key={i.key}>
                    <Link href={i.href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 transition-colors hover:bg-canvas/70">
                      <span className={cx('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg', i.kind === 'inactive' ? 'bg-amber-50 text-amber-800' : i.kind === 'class' ? 'bg-teal-50 text-teal-700' : 'bg-blue-50 text-blue')} aria-hidden>
                        <Icon className="size-4" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-medium">{i.title}{i.unread && <span className="size-1.5 shrink-0 rounded-full bg-blue" aria-label="new" />}</span>
                        <span className="block truncate text-[13px] text-muted">{i.detail}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {weekly !== null && (
            <label className="flex items-center justify-between gap-3 border-t border-line bg-canvas/60 px-4 py-3 text-sm">
              <span><span className="font-medium">Weekly summary email</span><span className="block text-xs text-muted">Mondays, 7am. Applications, attendance, grading and outcomes.</span></span>
              <input type="checkbox" role="switch" checked={weekly} disabled={pending}
                onChange={(e) => { const on = e.target.checked; setWeekly(on); start(async () => { const r = await setWeeklyDigest(slug, on); if (!r.ok) setWeekly(!on); }); }}
                className="peer sr-only" />
              <span aria-hidden className="relative h-5 w-9 shrink-0 rounded-full bg-mist transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-blue peer-checked:after:translate-x-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue" />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
