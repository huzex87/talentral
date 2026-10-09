'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Keyboard, SkipForward } from 'lucide-react';
import { buttonClass, cx } from '@/components/ui';
import { moveApplication } from './actions';

export interface ReviewNav {
  pos: number | null; total: number; reviewed: number;
  prev: string | null; next: string | null; nextUnreviewed: string | null; list: string; query: string;
}

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

// Review mode for one application: where it sits in the filtered list, how many the reviewer has
// scored, and quick ways on: J and K move, N jumps to the next one you have not scored, S
// shortlists (with the applicant email), ? shows the keys. Digits score in the scorecard.
export function ReviewBar({ slug, id, nav, canShortlist }: { slug: string; id: string; nav: ReviewNav; canShortlist: boolean }) {
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const href = (to: string) => `/dashboard/${slug}/applications/${to}${nav.query ? `?${nav.query}` : ''}`;

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'j' && nav.next) { e.preventDefault(); router.push(href(nav.next)); }
      else if (k === 'k' && nav.prev) { e.preventDefault(); router.push(href(nav.prev)); }
      else if (k === 'n' && nav.nextUnreviewed) { e.preventDefault(); router.push(href(nav.nextUnreviewed)); }
      else if (k === 's' && canShortlist && !pending) {
        e.preventDefault();
        start(async () => { const r = await moveApplication(slug, id, 'shortlisted', true); setToast(r.message); router.refresh(); });
      } else if (e.key === '?') { e.preventDefault(); setHelp((h) => !h); }
      else if (e.key === 'Escape') setHelp(false);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  const pct = nav.total ? Math.round((nav.reviewed / nav.total) * 100) : 0;
  return (
    <>
      <div className="z-20 -mx-4 -mt-6 mb-5 border-b border-line bg-canvas/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6 lg:sticky lg:top-0 lg:-mx-10 lg:-mt-10 lg:px-10">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href={nav.list} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"><ArrowLeft className="size-4" aria-hidden />Applications</Link>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <p className="whitespace-nowrap text-sm text-ink-2" aria-live="polite">
              {nav.pos ? <><b className="font-display font-semibold tabular-nums text-ink">{nav.pos.toLocaleString('en-NG')}</b> of {nav.total.toLocaleString('en-NG')}</> : 'Not in this list any more'}
              <span className="mx-1.5 text-mist">·</span><span className="tabular-nums">{nav.reviewed.toLocaleString('en-NG')} scored by you</span>
            </p>
            <div className="hidden h-1.5 w-32 rounded-full bg-hover sm:block" role="progressbar" aria-label="Scored by you" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-1.5 rounded-full bg-teal-700" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setHelp(!help)} aria-expanded={help} className={cx(buttonClass('ghost', 'sm'), 'hidden md:inline-flex')}><Keyboard aria-hidden />Keys</button>
            {nav.nextUnreviewed && <Link href={href(nav.nextUnreviewed)} className={cx(buttonClass('secondary', 'sm'), 'hidden sm:inline-flex')}><SkipForward aria-hidden />Next to score</Link>}
            {nav.prev ? <Link href={href(nav.prev)} className={buttonClass('secondary', 'sm')} aria-label="Previous application"><ChevronLeft aria-hidden /></Link>
              : <span className={cx(buttonClass('secondary', 'sm'), 'pointer-events-none opacity-45')} aria-hidden><ChevronLeft /></span>}
            {nav.next ? <Link href={href(nav.next)} className={buttonClass('secondary', 'sm')} aria-label="Next application"><ChevronRight aria-hidden /></Link>
              : <span className={cx(buttonClass('secondary', 'sm'), 'pointer-events-none opacity-45')} aria-hidden><ChevronRight /></span>}
          </div>
        </div>
        {help && (
          <div className="mt-2.5 grid gap-x-6 gap-y-1.5 rounded-[var(--radius-control)] border border-line bg-white p-3 text-[13px] text-ink-2 sm:grid-cols-3" role="note" aria-label="Keyboard shortcuts">
            {[['J', 'Next application'], ['K', 'Previous application'], ['N', 'Next one you have not scored'], ['0 to 9', 'Score the next criterion'], ['Ctrl + Enter', 'Save score and go next'], ['S', canShortlist ? 'Shortlist and email' : 'Shortlist (not from this status)']].map(([k, l]) => (
              <p key={k} className="flex items-center gap-2"><kbd className="min-w-7 rounded border border-line-strong bg-canvas px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold text-ink">{k}</kbd>{l}</p>
            ))}
          </div>
        )}
      </div>
      {toast && <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-[var(--shadow-pop)] lg:bottom-6">{toast}</div>}
      {/* Phones: jump straight to scoring or the decision, without covering the form. */}
      <div className="-mt-2 mb-5 flex gap-2 lg:hidden">
        <a href="#score" className={cx(buttonClass('secondary', 'sm'), 'flex-1')}>Score</a>
        <a href="#decision" className={cx(buttonClass('primary', 'sm'), 'flex-1')}>Decide</a>
      </div>
    </>
  );
}
