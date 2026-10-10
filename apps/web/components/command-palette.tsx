'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, FileSearch, Plus, Search, UserRound, Users, BookOpen, Megaphone, type LucideIcon } from 'lucide-react';
import { hubCreateActions, hubSections } from './hub-sections';
import { cx } from './ui';

type Hit = { group: string; title: string; detail?: string; href: string; icon: LucideIcon };
const GROUP_ICONS: Record<string, LucideIcon> = { Applicants: UserRound, Learners: UserRound, Cohorts: Users, Courses: BookOpen, Programmes: Megaphone };

// Ctrl+K (⌘K on a Mac) from anywhere in a hub dashboard: jump to a section, start something new,
// or find an applicant, cohort, course or programme by name. Arrow keys move, Enter opens.
const OPEN_EVENT = 'talentral:search';

// A button that opens the palette; there can be several (header, sidebar), one palette listens.
export function SearchButton({ compact = false }: { compact?: boolean }) {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return (
    <button type="button" onClick={(e) => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: e.currentTarget }))} aria-haspopup="dialog" aria-label="Search and go to"
      className={cx('flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] text-sm text-[#AEB5C8] transition-colors hover:bg-white/[0.08] hover:text-white',
        compact ? 'size-8 justify-center border-transparent bg-transparent' : 'h-8 w-full px-2.5')}>
      <Search className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
      {!compact && <><span className="flex-1 text-left">Search</span><kbd className="rounded border border-white/15 px-1.5 font-sans text-[11px] text-[#8B93AB]">{mac ? '⌘K' : 'Ctrl K'}</kbd></>}
    </button>
  );
}

export function CommandPalette({ slug, manage, select = true }: { slug: string; manage: boolean; select?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const list = useId();

  const local = useMemo<Hit[]>(() => {
    const pages = hubSections(slug, manage, select).flatMap((g) => g.items.map((i) => ({ group: 'Go to', title: i.label, href: i.href, icon: i.icon, k: `${i.label} ${i.keywords ?? ''}`.toLowerCase() })));
    const make = hubCreateActions(slug, manage).map((a) => ({ group: 'Create', title: a.label, href: a.href, icon: Plus, k: a.label.toLowerCase() }));
    const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const match = (k: string) => words.every((w) => k.includes(w));
    return [...pages, ...make].filter((h) => !words.length || match(h.k)).slice(0, words.length ? 6 : 12);
  }, [q, slug, manage, select]);

  useEffect(() => {
    if (q.trim().length < 2) { setRemote([]); setLoading(false); return; }
    setLoading(true);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/dashboard/${slug}/search?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal });
        const { hits } = (await r.json()) as { hits: { group: string; title: string; detail: string; href: string }[] };
        setRemote(hits.map((h) => ({ ...h, icon: GROUP_ICONS[h.group] ?? FileSearch })));
      } catch { /* aborted or offline: keep what we have */ } finally { setLoading(false); }
    }, 180);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, slug]);

  const hits = [...remote, ...local];
  useEffect(() => setActive(0), [q, remote.length]);

  const close = useCallback(() => { setOpen(false); setQ(''); trigger.current?.focus(); }, []);
  const go = (h: Hit | undefined) => { if (!h) return; setOpen(false); setQ(''); router.push(h.href); };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); trigger.current = document.activeElement as HTMLElement; setOpen((o) => !o); }
    };
    const fromButton = (e: Event) => { trigger.current = (e as CustomEvent<HTMLElement>).detail ?? null; setOpen(true); };
    document.addEventListener('keydown', key);
    window.addEventListener(OPEN_EVENT, fromButton);
    return () => { document.removeEventListener('keydown', key); window.removeEventListener(OPEN_EVENT, fromButton); };
  }, []);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 0); }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(hits[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  let lastGroup = '';
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-white/70 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div role="dialog" aria-modal="true" aria-label="Search and go to" className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-white text-ink shadow-[0_24px_60px_-12px_rgba(16,24,40,0.28)]">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="size-5 shrink-0 text-subtle" aria-hidden />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
                role="combobox" aria-expanded="true" aria-controls={list} aria-activedescendant={hits[active] ? `${list}-${active}` : undefined} aria-autocomplete="list"
                placeholder="Search applicants, cohorts, courses or pages" aria-label="Search"
                className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-subtle" />
              {loading && <span className="size-4 animate-spin rounded-full border-2 border-mist border-t-blue" aria-hidden />}
              <kbd className="rounded border border-line-strong px-1.5 text-[11px] text-muted">Esc</kbd>
            </div>
            <ul id={list} role="listbox" aria-label="Results" className="max-h-[55dvh] overflow-y-auto p-2">
              {hits.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">{loading ? 'Searching…' : `Nothing matches “${q}”.`}</li>}
              {hits.map((h, i) => {
                const head = h.group !== lastGroup ? h.group : null;
                lastGroup = h.group;
                const Icon = h.icon;
                return (
                  <li key={`${h.group}-${h.href}-${i}`} role="presentation">
                    {head && <p className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted" aria-hidden>{head}</p>}
                    <div id={`${list}-${i}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => go(h)}
                      className={cx('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2', i === active ? 'bg-blue-50' : '')}>
                      <span className={cx('grid size-8 shrink-0 place-items-center rounded-lg', i === active ? 'bg-white text-blue shadow-[var(--shadow-card)]' : 'bg-canvas text-muted')} aria-hidden><Icon className="size-4" strokeWidth={1.75} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{h.title}</span>
                        {h.detail && <span className="block truncate text-xs text-muted">{h.detail}</span>}
                      </span>
                      {i === active && <CornerDownLeft className="size-4 shrink-0 text-subtle" aria-hidden />}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center gap-4 border-t border-line bg-canvas/60 px-4 py-2 text-[11px] text-muted" aria-hidden>
              <span><kbd className="font-sans font-semibold">↑ ↓</kbd> move</span><span><kbd className="font-sans font-semibold">Enter</kbd> open</span><span><kbd className="font-sans font-semibold">Esc</kbd> close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
