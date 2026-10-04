'use client';
import { useState, useTransition } from 'react';
import { setWhatsApp } from '@/app/whatsapp-actions';
import { Button, cx } from './ui';

type Lang = 'en' | 'ha';

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.13c-.24.68-1.42 1.3-1.95 1.34-.5.05-.97.23-3.27-.68-2.77-1.09-4.51-3.92-4.65-4.1-.13-.18-1.11-1.48-1.11-2.82s.7-2 .95-2.28c.24-.27.53-.34.71-.34l.51.01c.16.01.38-.06.6.46.23.54.77 1.87.84 2 .07.14.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.7 1.16 1.51 1.88 1.04.93 1.92 1.21 2.19 1.35.27.14.43.11.59-.07.16-.18.68-.79.86-1.07.18-.27.36-.23.61-.14.25.09 1.58.75 1.85.88.27.14.45.2.52.32.07.11.07.66-.17 1.34Z" />
    </svg>
  );
}

// Asks once on My learning: WhatsApp instead of SMS for reminders and hub messages?
export function WhatsAppPrompt({ lang, masked }: { lang: Lang; masked: string }) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const [done, setDone] = useState<boolean | null>(null);
  const [pending, start] = useTransition();
  const choose = (on: boolean) => start(async () => { await setWhatsApp(on); setDone(on); });
  if (done === false) return null;
  return (
    <section aria-labelledby="wa-q" className="mb-6 flex flex-col gap-4 rounded-[var(--radius-card)] border border-[#25D366]/30 bg-[#F0FBF4] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#25D366] text-white"><WhatsAppIcon className="size-6" /></span>
        {done ? (
          <p role="status" className="text-sm"><b>{t('Done.', 'An gama.')}</b> {t(`Reminders and messages from your hub now come to ${masked} on WhatsApp. Reply STOP there to stop.`, `Tunatarwa da saƙonni daga cibiyarka za su zo ${masked} a WhatsApp. Aika TSAYA a can don dakatarwa.`)}</p>
        ) : (
          <div>
            <h2 id="wa-q" className="font-semibold">{t('Get class reminders on WhatsApp?', 'Kana son samun tunatarwar aji a WhatsApp?')}</h2>
            <p className="text-sm text-muted">{t(`We will send reminders and hub messages to ${masked} on WhatsApp instead of SMS. You can change this any time.`, `Za mu aiko tunatarwa da saƙonnin cibiya zuwa ${masked} a WhatsApp maimakon SMS. Za ka iya canza wannan a kowane lokaci.`)}</p>
          </div>
        )}
      </div>
      {!done && (
        <div className="flex shrink-0 gap-2">
          <button type="button" disabled={pending} onClick={() => choose(true)} className="inline-flex h-10 items-center justify-center rounded-[var(--radius-control)] bg-[#0E7A3F] px-4 text-sm font-medium text-white transition hover:bg-[#0B6634] disabled:opacity-60">{t('Yes, use WhatsApp', 'Eh, yi amfani da WhatsApp')}</button>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => choose(false)}>{t('No thanks', 'A’a, na gode')}</Button>
        </div>
      )}
    </section>
  );
}

// The setting on the account page.
export function WhatsAppSwitch({ on: initial, masked }: { on: boolean; masked: string }) {
  const [on, setOn] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = () => start(async () => {
    const next = !on;
    await setWhatsApp(next);
    setOn(next);
    setMsg(next ? `Reminders and hub messages now come to ${masked} on WhatsApp.` : 'WhatsApp messages are off. Reminders come by SMS instead.');
  });
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p id="wa-label" className="text-sm"><b>WhatsApp messages</b> to {masked}</p>
        <button type="button" role="switch" aria-checked={on} aria-labelledby="wa-label" disabled={pending} onClick={toggle}
          className={cx('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40', on ? 'bg-[#0E7A3F]' : 'bg-line')}>
          <span className={cx('inline-block size-5 rounded-full bg-white shadow transition', on ? 'translate-x-6' : 'translate-x-1')} />
        </button>
      </div>
      {msg && <p role="status" className="mt-2 text-sm text-teal-700">{msg}</p>}
    </div>
  );
}
