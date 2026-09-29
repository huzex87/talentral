'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { completeLesson } from '@/app/learn/actions';
import { clearOffline, dropQueued, offlineIndex, queuedProgress } from '@/lib/offline';

// Runs on every learner screen: installs the offline worker, removes a previous learner's saved
// lessons, sends progress made offline once the connection is back, and says when the phone is
// offline.
export function PwaSetup({ userId, lang }: { userId: string; lang: 'en' | 'ha' }) {
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const router = useRouter();
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);

  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* not supported here */ });
    }
    const index = offlineIndex();
    if (index.userId && index.userId !== userId) void clearOffline();

    let busy = false;
    const flush = async () => {
      const items = queuedProgress();
      setQueued(items.length);
      if (busy || !navigator.onLine || !items.length) return;
      busy = true;
      setSyncing(true);
      let sent = 0;
      for (const item of items) {
        try { await completeLesson(item.cohortId, item.lessonId); dropQueued(item.lessonId); sent++; } catch { break; }
      }
      busy = false;
      setSyncing(false);
      setQueued(queuedProgress().length);
      if (sent) router.refresh();
    };
    const goOnline = () => { setOnline(true); void flush(); };
    const goOffline = () => setOnline(false);
    const recount = () => setQueued(queuedProgress().length);
    setOnline(navigator.onLine);
    void flush();
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('talentral:queue', recount);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('talentral:queue', recount);
    };
  }, [userId, router]);

  if (online && !queued) return null;
  return (
    <div role="status" className={online ? 'bg-teal-50 text-teal-700' : 'bg-midnight text-white'}>
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 text-sm sm:px-6">
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${online ? 'bg-teal-700' : 'bg-amber-400'}`} />
        {online
          ? <span>{syncing ? t('Sending progress saved on this phone…', 'Ana aika ci gaban da aka ajiye a wayar nan…') : t(`${queued} lesson${queued === 1 ? '' : 's'} waiting to sync.`, `Darasi ${queued} na jiran a aika.`)}</span>
          : <span><b>{t('You are offline.', 'Ba ka kan intanet.')}</b> {t('Downloaded lessons still open, and anything you finish is saved on this phone until you reconnect.', 'Darussan da ka sauke suna buɗewa, kuma duk abin da ka gama za a ajiye a wayar nan har ka dawo kan intanet.')}</span>}
      </div>
    </div>
  );
}
