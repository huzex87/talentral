'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';

interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const DISMISS_KEY = 'talentral:install-dismissed';

// Offers to put Talentral on the home screen. Android shows the browser's own install prompt;
// iPhones need Share, then Add to Home Screen, so they get those steps instead.
export function InstallCard({ lang }: { lang: 'en' | 'ha' }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone;
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === '1'; } catch { /* ignore */ }
    if (standalone || dismissed) return;
    const apple = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIos(apple);
    if (apple) setHidden(false);
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt); setHidden(false); };
    const onInstalled = () => setHidden(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  if (hidden) return null;
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ } setHidden(true); };

  return (
    <section aria-label={t('Install the app', 'Saka manhajar')} className="mb-6 flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)] sm:p-5">
      <img src="/icons/icon-192.png" alt="" className="size-12 rounded-xl shadow-sm" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t('Put Talentral on your home screen', 'Saka Talentral a fuskar wayarka')}</p>
        <p className="text-sm text-muted">
          {ios
            ? t('Tap the Share button, then “Add to Home Screen”. It opens like an app and works with downloaded lessons offline.',
              'Danna maɓallin Share, sannan “Add to Home Screen”. Zai buɗe kamar manhaja kuma yana aiki da darussan da ka sauke ba tare da intanet ba.')
            : t('Opens like an app, uses little data and works offline with downloaded lessons.', 'Yana buɗewa kamar manhaja, ba ya cin data sosai kuma yana aiki ba tare da intanet ba da darussan da ka sauke.')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {prompt && <Button size="sm" onClick={async () => { await prompt.prompt(); const { outcome } = await prompt.userChoice; if (outcome === 'accepted') setHidden(true); setPrompt(null); }}>{t('Install', 'Saka')}</Button>}
        <Button size="sm" variant="ghost" onClick={dismiss}>{t('Not now', 'Ba yanzu ba')}</Button>
      </div>
    </section>
  );
}
