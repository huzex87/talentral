'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { savePhoto, type PassportState } from './actions';

// The Passport photo: tap the picture to choose a new one (it saves at once), or remove it.
// Without a photo the learner's initial stands in, on the brand gradient.
export function PassportPhoto({ src, initial, lang }: { src: string | null; initial: string; lang: 'en' | 'ha' }) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const [state, action, pending] = useActionState<PassportState, FormData>(savePhoto, {});
  const [preview, setPreview] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.errors) setPreview(null); }, [state]);
  const shown = preview ?? src;
  return (
    <div className="shrink-0">
      <form ref={form} action={action} className="group relative block size-24 sm:size-28">
        <label className="relative block size-full cursor-pointer overflow-hidden rounded-full ring-4 ring-white shadow-[var(--shadow-card)]">
          {shown
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={shown} alt={t('Your Passport photo', 'Hoton Fasfonka')} className="size-full object-cover" />
            : <span className="grid size-full place-items-center bg-[linear-gradient(135deg,#6D3FD9,#2E5BFF_55%,#14B8A6)] font-display text-4xl font-semibold text-white" aria-hidden>{initial}</span>}
          <span className="absolute inset-0 grid place-items-center bg-ink/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100" aria-hidden><Camera className="size-6" /></span>
          <input type="file" name="photo" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={pending}
            aria-label={shown ? t('Change your photo', 'Canza hotonka') : t('Add a photo', 'Saka hoto')}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPreview(URL.createObjectURL(f)); form.current?.requestSubmit(); } }} />
        </label>
        {pending && <span className="absolute inset-0 grid place-items-center rounded-full bg-white/60" role="status" aria-label={t('Saving', 'Ana adanawa')}><span className="size-6 animate-spin rounded-full border-2 border-blue border-t-transparent" /></span>}
      </form>
      {src && !pending && (
        <form action={action} className="mt-1.5 text-center">
          <input type="hidden" name="remove" value="1" />
          <button className="text-xs font-medium text-muted hover:text-danger">{t('Remove photo', 'Cire hoto')}</button>
        </form>
      )}
      {state.errors?.photo && <p className="mt-1.5 max-w-40 text-xs font-medium text-danger" role="alert">{state.errors.photo}</p>}
    </div>
  );
}
