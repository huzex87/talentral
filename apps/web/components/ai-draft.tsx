'use client';
// "Draft with AI": a panel that asks Claude for a draft, shows it, and only puts it into the form when
// the person chooses to. Nothing is saved until they press the form's own Save button.
import { useId, useState, useTransition, type ReactNode } from 'react';
import type { DraftResult } from '@/lib/ai';
import { Alert, Button, Textarea, cx } from './ui';

export function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={cx('size-4', className)}>
      <path d="M10 1.5c.3 0 .55.2.63.49l.9 3.15a3.5 3.5 0 0 0 2.4 2.4l3.15.9a.65.65 0 0 1 0 1.26l-3.15.9a3.5 3.5 0 0 0-2.4 2.4l-.9 3.15a.65.65 0 0 1-1.26 0l-.9-3.15a3.5 3.5 0 0 0-2.4-2.4l-3.15-.9a.65.65 0 0 1 0-1.26l3.15-.9a3.5 3.5 0 0 0 2.4-2.4l.9-3.15A.65.65 0 0 1 10 1.5Z" />
      <path d="M16 1c.15 0 .28.1.32.24l.3 1.02a1.2 1.2 0 0 0 .82.82l1.02.3a.33.33 0 0 1 0 .64l-1.02.3a1.2 1.2 0 0 0-.82.82l-.3 1.02a.33.33 0 0 1-.64 0l-.3-1.02a1.2 1.2 0 0 0-.82-.82l-1.02-.3a.33.33 0 0 1 0-.64l1.02-.3a1.2 1.2 0 0 0 .82-.82l.3-1.02A.33.33 0 0 1 16 1Z" opacity=".6" />
    </svg>
  );
}

// Sets a form field that React does not control (defaultValue), as if the person had typed it, so
// character counters and "unsaved changes" logic see the change.
export function fillField(id: string, value: string) {
  const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) return;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export const readField = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? '';

export interface AiDraftProps<T> {
  // What the button says, e.g. "Draft with AI" or "Translate to Hausa".
  label?: string;
  title: string;
  intro?: ReactNode;
  notesLabel?: string;
  notesPlaceholder?: string;
  // Hides the notes box, for drafts that need nothing more (a translation).
  noNotes?: boolean;
  // Extra controls above the Draft button (for example, how many questions).
  controls?: ReactNode;
  draftLabel?: string;
  notice?: ReactNode;
  run: (notes: string) => Promise<DraftResult<T>>;
  preview: (draft: T) => ReactNode;
  // Returns what to tell the person, or nothing to use the default.
  apply: (draft: T) => void | string | Promise<void | string>;
  useLabel?: string | ((draft: T) => string);
  align?: 'start' | 'end';
}

export function AiDraft<T>({ label = 'Draft with AI', title, intro, notesLabel = 'What should it cover?', notesPlaceholder, noNotes, controls, draftLabel = 'Draft', notice, run, preview, apply, useLabel = 'Use this draft', align = 'start' }: AiDraftProps<T>) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<DraftResult<T> | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [using, startUse] = useTransition();
  const id = useId();

  const ask = () => start(async () => {
    setDone(null);
    try { setResult(await run(notes)); } catch { setResult({ ok: false, error: 'Something went wrong. Try again.' }); }
  });
  const close = () => { setOpen(false); setResult(null); };

  if (!open) {
    return (
      <div className={cx('flex flex-wrap items-center gap-3', align === 'end' && 'justify-end')}>
        <button type="button" onClick={() => { setOpen(true); setDone(null); }}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-violet/25 bg-violet-50 px-3 text-[13px] font-semibold text-violet transition hover:border-violet/50 hover:bg-violet-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet/40">
          <Sparkle className="size-3.5" />{label}
        </button>
        {done && <span className="text-[13px] font-medium text-teal-700" role="status">✓ {done}</span>}
      </div>
    );
  }

  const draft = result?.ok ? result.data : null;
  return (
    <section aria-labelledby={`${id}-t`} className="overflow-hidden rounded-xl border border-violet/25 bg-gradient-to-b from-violet-50/80 to-white shadow-sm">
      <header className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div className="min-w-0">
          <h3 id={`${id}-t`} className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <span className="grid size-6 place-items-center rounded-lg bg-violet text-white"><Sparkle className="size-3.5" /></span>{title}
          </h3>
          {intro && <p className="mt-1 text-[13px] leading-snug text-muted">{intro}</p>}
        </div>
        <button type="button" onClick={close} className="-mr-1 grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-white hover:text-ink" aria-label="Close AI drafting">✕</button>
      </header>

      <div className="space-y-3 px-4 pb-4 pt-3">
        {!draft && (<>
          {!noNotes && (
            <div className="space-y-1.5">
              <label htmlFor={`${id}-n`} className="block text-sm font-semibold">{notesLabel} <span className="font-normal text-muted">(optional)</span></label>
              <Textarea id={`${id}-n`} rows={3} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={notesPlaceholder} className="min-h-20 bg-white text-sm" />
            </div>
          )}
          {controls}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={ask} disabled={pending} aria-busy={pending} className="inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-violet px-3.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
              {pending ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : <Sparkle className="size-3.5" />}
              {pending ? 'Drafting…' : draftLabel}
            </button>
            {pending && <span className="text-[13px] text-muted" role="status">This can take up to a minute.</span>}
          </div>
        </>)}

        {result && !result.ok && <Alert tone="danger">{result.error}</Alert>}

        {draft && (<>
          <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-line bg-white p-4 text-sm leading-relaxed" aria-label="Draft" tabIndex={0}>
            {preview(draft)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={using} onClick={() => startUse(async () => {
              const said = await apply(draft);
              setDone(said || 'Draft added. Review it, then save.'); close();
            })}>{using ? 'Adding…' : typeof useLabel === 'function' ? useLabel(draft) : useLabel}</Button>
            <Button type="button" size="sm" variant="secondary" onClick={ask} disabled={pending || using}>{pending ? 'Drafting…' : 'Try again'}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setResult(null)} disabled={pending || using}>Change notes</Button>
          </div>
        </>)}

        <p className="flex gap-1.5 border-t border-violet/10 pt-2.5 text-xs leading-snug text-muted">
          <span aria-hidden>ⓘ</span>
          <span>{notice ?? 'Claude drafts, you decide. Check every fact, name, date and amount. Nothing is saved until you press Save.'}</span>
        </p>
      </div>
    </section>
  );
}

// Shows plain drafted text with its paragraphs and line breaks.
export function DraftText({ text, className }: { text: string; className?: string }) {
  return <div className={cx('whitespace-pre-line', className)}>{text}</div>;
}
