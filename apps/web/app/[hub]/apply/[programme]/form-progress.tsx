'use client';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Check, CloudOff, HardDriveDownload } from 'lucide-react';
import { cx } from '@/components/ui';

// Never kept on the device: files, consent, the bot trap and uploaded-file receipts.
const SKIP = (name: string) => name === 'consent' || name === 'website' || name.endsWith('.uploaded') || name === '$ACTION_ID' || name.startsWith('$ACTION');

const draftKey = (programmeId: string) => `talentral:apply:${programmeId}`;

export function clearApplicationDraft(programmeId: string) {
  try { localStorage.removeItem(draftKey(programmeId)); } catch { /* storage blocked: nothing kept */ }
}

// Remembers which application is being sent, so the confirmation page can drop its draft.
export function markApplicationSending(programmeId: string) {
  try { sessionStorage.setItem('talentral:apply:sending', programmeId); } catch { /* storage blocked */ }
}

// On the confirmation page: the application arrived, so its draft is no longer needed.
export function ClearSentDraft() {
  useEffect(() => {
    try {
      const id = sessionStorage.getItem('talentral:apply:sending');
      if (id) { clearApplicationDraft(id); sessionStorage.removeItem('talentral:apply:sending'); }
    } catch { /* storage blocked */ }
  }, []);
  return null;
}

// Keeps a draft of the application on this device as the applicant types, and puts it back if
// they leave and return (a dropped connection, a closed tab). Nothing is sent anywhere until they
// submit. Returns when the draft was last saved, and a way to throw it away.
export function useApplicationDraft(form: RefObject<HTMLFormElement | null>, programmeId: string, restore: boolean) {
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [restored, setRestored] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = form.current;
    if (!el || !restore) return;
    let raw: string | null = null;
    try { raw = localStorage.getItem(draftKey(programmeId)); } catch { return; }
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { at: string; values: Record<string, string[]> };
      for (const [name, values] of Object.entries(data.values)) {
        const fields = [...el.elements].filter((f): f is HTMLInputElement => (f as HTMLInputElement).name === name);
        for (const f of fields) {
          if (f.type === 'checkbox' || f.type === 'radio') f.checked = values.includes(f.value);
          else if (f.type !== 'file') f.value = values[0] ?? '';
        }
      }
      setSavedAt(new Date(data.at));
      setRestored(true);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } catch { /* an old or damaged draft: ignore it */ }
  }, [form, programmeId, restore]);

  const save = useCallback(() => {
    const el = form.current;
    if (!el) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const values: Record<string, string[]> = {};
      for (const [k, v] of new FormData(el).entries()) {
        if (SKIP(k) || typeof v !== 'string') continue;
        (values[k] ??= []).push(v);
      }
      try {
        localStorage.setItem(draftKey(programmeId), JSON.stringify({ at: new Date().toISOString(), values }));
        setSavedAt(new Date());
      } catch { /* private browsing or storage full: the form still works */ }
    }, 600);
  }, [form, programmeId]);

  const clear = useCallback(() => {
    clearApplicationDraft(programmeId);
    setSavedAt(null);
    setRestored(false);
    form.current?.reset();
    form.current?.dispatchEvent(new Event('input', { bubbles: true }));
  }, [form, programmeId]);

  return { savedAt, restored, save, clear };
}

export interface Step { id: string; title: string }

// The sticky bar above the form: the numbered sections with a tick when every required answer in
// them is given, overall progress, and the state of the draft on this device.
export function FormProgress({ form, steps, savedAt, restored, onClear, tick }: {
  form: RefObject<HTMLFormElement | null>; steps: Step[]; savedAt: Date | null; restored: boolean; onClear: () => void; tick: number;
}) {
  const [status, setStatus] = useState<{ id: string; done: number; total: number }[]>([]);
  useEffect(() => {
    const el = form.current;
    if (!el) return;
    setStatus(steps.map((s) => {
      const section = el.querySelector<HTMLElement>(`[data-step="${s.id}"]`);
      if (!section) return { id: s.id, done: 0, total: 0 };
      const required = [...section.querySelectorAll<HTMLInputElement>('[required], [data-required]')];
      const names = [...new Set(required.map((r) => r.name || r.dataset.required!))];
      const answered = names.filter((n) => {
        if (section.querySelector(`[name="${CSS.escape(n)}.uploaded"]`)) return true; // a document already uploaded
        const fields = [...section.querySelectorAll<HTMLInputElement>(`[name="${CSS.escape(n)}"], [data-required="${CSS.escape(n)}"]`)];
        return fields.some((f) => (f.type === 'checkbox' || f.type === 'radio' ? f.checked : f.type === 'file' ? Boolean(f.files?.length) : f.value.trim() !== ''));
      });
      return { id: s.id, done: answered.length, total: names.length };
    }));
  }, [form, steps, tick]);

  const total = status.reduce((n, s) => n + s.total, 0);
  const done = status.reduce((n, s) => n + s.done, 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const time = savedAt ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(savedAt) : null;

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-6 border-b border-line bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ol className="flex min-w-0 items-center gap-1.5 overflow-x-auto text-[13px] [scrollbar-width:none]" aria-label="Sections">
          {steps.map((s, i) => {
            const st = status.find((x) => x.id === s.id);
            const complete = st ? st.total > 0 && st.done === st.total : false;
            return (
              <li key={s.id} className="flex shrink-0 items-center gap-1.5">
                {i > 0 && <span className="h-px w-3 bg-line-strong sm:w-5" aria-hidden />}
                <a href={`#${s.id}`} className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 font-medium text-ink-2 hover:bg-hover">
                  <span className={cx('grid size-5 place-items-center rounded-full text-[11px] font-semibold', complete ? 'bg-[var(--hub)] text-white' : 'border border-line-strong bg-white text-muted')} aria-hidden>
                    {complete ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="hidden sm:inline">{s.title}</span><span className="sr-only sm:hidden">{s.title}</span>
                  <span className="sr-only">{complete ? ' (complete)' : st ? ` (${st.done} of ${st.total} required answers)` : ''}</span>
                </a>
              </li>
            );
          })}
        </ol>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="hidden items-center gap-1.5 sm:flex" aria-live="polite">
            {time ? <><HardDriveDownload className="size-3.5" aria-hidden />{restored ? `Draft restored · saved ${time}` : `Draft saved on this device ${time}`}</> : <><CloudOff className="size-3.5" aria-hidden />Drafts save on this device as you type</>}
          </span>
          {time && <button type="button" onClick={onClear} className="font-medium text-muted underline underline-offset-2 hover:text-ink">Clear</button>}
        </div>
      </div>
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-hover" role="progressbar" aria-label="Required answers given" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-[var(--hub)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
