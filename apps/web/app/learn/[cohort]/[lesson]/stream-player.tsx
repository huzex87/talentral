'use client';
import { useEffect, useState } from 'react';
import { cx } from '@/components/ui';

type Lang = 'en' | 'ha';
const KEY = 'tl_data_saver';

// A streamed lesson video. Online it plays in the adaptive player, which picks the quality the
// connection can carry. "Data saver" plays the small 360p file instead, and so does a phone that
// is offline (the file saved with the course).
export function StreamPlayer({ embed, small, title, renditions, lang }: { embed: string | null; small: string; title: string; renditions: string[]; lang: Lang }) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const [saver, setSaver] = useState(false);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    try { setSaver(localStorage.getItem(KEY) === '1'); } catch { /* storage blocked */ }
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const choose = (on: boolean) => {
    setSaver(on);
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
  };
  const adaptive = Boolean(embed) && online && !saver;

  return (
    <div>
      {adaptive
        ? <div className="aspect-video overflow-hidden rounded-2xl bg-ink shadow-lg"><iframe src={embed!} title={title} className="size-full" allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" /></div>
        : <video controls preload="metadata" playsInline className="aspect-video w-full rounded-2xl bg-ink shadow-lg" src={small} aria-label={title} />}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>{!online ? t('Offline: playing the copy saved on this phone.', 'Babu intanet: ana kunna kwafin da ke kan wayarka.')
          : adaptive ? t(`Quality adjusts to your connection${renditions.length ? ` (${renditions[0]} to ${renditions[renditions.length - 1]})` : ''}.`, 'Inganci yana daidaita da haɗin intanet ɗinka.')
            : t('Data saver: playing the small 360p version.', 'Ajiye data: ana kunna ƙaramin 360p.')}</span>
        {embed && online && (
          <span role="group" aria-label={t('Video quality', 'Ingancin bidiyo')} className="inline-flex overflow-hidden rounded-lg border border-line bg-white text-xs font-semibold">
            <button type="button" aria-pressed={!saver} onClick={() => choose(false)} className={cx('px-2.5 py-1.5', !saver ? 'bg-blue text-white' : 'text-muted hover:text-ink')}>{t('Auto quality', 'Inganci kai tsaye')}</button>
            <button type="button" aria-pressed={saver} onClick={() => choose(true)} className={cx('px-2.5 py-1.5', saver ? 'bg-blue text-white' : 'text-muted hover:text-ink')}>{t('Data saver', 'Ajiye data')}</button>
          </span>
        )}
      </div>
    </div>
  );
}
