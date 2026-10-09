'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { buttonClass, cx } from './ui';

// A GET filter form that applies itself: changing a select, date or checkbox reloads the results,
// and typing in a search box applies after a short pause (or on Enter). Without JavaScript the
// Apply button stays, so the form still works. On phones the fields fold into a "Filters (n)"
// sheet so the results come first; `lead` (usually the search box) stays in view. Every field
// renders once, so ids and labels stay unique.
export function FilterBar({ children, lead, active = 0, label = 'Filters', applyLabel = 'Apply', className, fieldsClassName, collapse = true, after, ariaLabel }: {
  children: ReactNode; lead?: ReactNode; active?: number; label?: string; applyLabel?: string; className?: string; fieldsClassName?: string;
  collapse?: boolean; after?: ReactNode; ariaLabel?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open]);

  const submit = () => { if (timer.current) clearTimeout(timer.current); form.current?.requestSubmit(); };
  const onChange = (e: React.FormEvent<HTMLFormElement>) => {
    const t = e.target as HTMLInputElement;
    if (t.type === 'search' || t.type === 'text') {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(submit, 500);
    } else if (!open) submit();
  };

  return (
    <form ref={form} onChange={onChange} onSubmit={() => setOpen(false)} aria-label={ariaLabel} className={cx('flex flex-wrap items-end gap-2', className)}>
      {lead && <div className="min-w-0 flex-1 basis-56">{lead}</div>}
      {collapse && (
        <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-haspopup="dialog" className={cx(buttonClass('secondary'), 'md:hidden')}>
          <SlidersHorizontal aria-hidden />{label}
          {active > 0 && <span className="rounded-full bg-blue px-1.5 text-[11px] font-semibold leading-[18px] text-white" aria-label={`${active} on`}>{active}</span>}
        </button>
      )}
      {open && <div className="fixed inset-0 z-40 bg-white/70 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <div role={open ? 'dialog' : undefined} aria-modal={open || undefined} aria-label={open ? label : undefined}
        className={cx(
          'flex-wrap items-end gap-2 [&>*]:min-w-0',
          collapse && !open ? 'hidden md:flex' : 'flex',
          open && 'fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] flex-col items-stretch overflow-y-auto rounded-t-2xl border border-line bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[var(--shadow-pop)] [&>*]:w-full md:static md:max-h-none md:flex-row md:items-end md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:[&>*]:w-auto',
          fieldsClassName,
        )}>
        {open && (
          <div className="flex items-center justify-between md:hidden">
            <p className="font-display text-lg font-semibold">{label}</p>
            <button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-hover" aria-label="Close filters"><X className="size-5" aria-hidden /></button>
          </div>
        )}
        {children}
        {open && <button className={cx(buttonClass('primary'), 'mt-1 md:hidden')}>Show results</button>}
      </div>
      {!ready && <button className={buttonClass('secondary')}>{applyLabel}</button>}
      {after}
    </form>
  );
}

// A labelled field inside a FilterBar: small label above, control below.
export function FilterField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block text-sm', className)}>
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}
