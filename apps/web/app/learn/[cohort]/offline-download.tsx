'use client';
import { useCallback, useEffect, useState } from 'react';
import { formatBytes } from '@talentral/domain';
import { Button, cx } from '@/components/ui';
import { MEDIA_CACHE, PAGES_CACHE, offlineIndex, removeCourse, saveCourse, totalBytes, type SavedCourse } from '@/lib/offline';
import { offlinePlan, type OfflineItem } from '../actions';

type Lang = 'en' | 'ha';
type Progress = { done: number; total: number; label: string } | null;
const STATIC_CACHE = 'talentral-static';
const CHANGED = 'talentral:offline';

// Saves pages, the scripts and styles they need, and lesson files, for one module or the course.
async function save(cohortId: string, items: OfflineItem[], onStep: (label: string) => void): Promise<{ lessons: Record<string, number>; failed: string[] }> {
  const pages = await caches.open(PAGES_CACHE);
  const media = await caches.open(MEDIA_CACHE);
  const assets = await caches.open(STATIC_CACHE);
  const lessons: Record<string, number> = {};
  const failed: string[] = [];

  async function savePage(path: string) {
    const res = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'text/html' } });
    if (!res.ok || res.redirected) throw new Error(`page ${res.status}`);
    const html = await res.clone().text();
    await pages.put(new URL(path, location.origin).href, res);
    // The page's own scripts, styles and fonts, so it also opens when the phone has never
    // loaded them before.
    for (const src of new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) ?? [])) {
      if (await assets.match(src)) continue;
      const a = await fetch(src).catch(() => null);
      if (a?.ok) await assets.put(src, a);
    }
  }

  await savePage('/learn');
  await savePage(`/learn/${cohortId}`);
  for (const item of items) {
    onStep(item.lessonId);
    try {
      await savePage(`/learn/${cohortId}/${item.lessonId}`);
      let bytes = 0;
      if (item.file) {
        const path = `/learn/media/${cohortId}/${item.lessonId}`;
        const where = await (await fetch(`${path}?offline=1`)).json() as { url: string | null; type: string };
        const res = where.url ? await fetch(where.url, { mode: 'cors' }) : await fetch(`${path}?stream=1`);
        if (!res.ok) throw new Error(`file ${res.status}`);
        const blob = await res.blob();
        await media.put(new URL(path, location.origin).href, new Response(blob, { headers: { 'Content-Type': where.type || blob.type, 'Content-Length': String(blob.size) } }));
        bytes = blob.size;
      }
      lessons[item.lessonId] = bytes;
    } catch {
      failed.push(item.lessonId);
    }
  }
  return { lessons, failed };
}

function useSaved(cohortId: string) {
  const [course, setCourse] = useState<SavedCourse | null>(null);
  const refresh = useCallback(() => setCourse(offlineIndex().courses[cohortId] ?? null), [cohortId]);
  useEffect(() => {
    refresh();
    window.addEventListener(CHANGED, refresh);
    return () => window.removeEventListener(CHANGED, refresh);
  }, [refresh]);
  return course;
}

function useDownload({ cohortId, userId, title, hub }: { cohortId: string; userId: string; title: string; hub: string }) {
  const [progress, setProgress] = useState<Progress>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (moduleId?: string) => {
    setError(null);
    if (!('caches' in window)) { setError('unsupported'); return; }
    if (!navigator.onLine) { setError('offline'); return; }
    try {
      await navigator.storage?.persist?.().catch(() => false);
      const plan = await offlinePlan(cohortId, moduleId);
      const saveable = plan.filter((i) => !i.online);
      setProgress({ done: 0, total: saveable.length, label: '' });
      let done = 0;
      const result = await save(cohortId, saveable, () => setProgress({ done: done++, total: saveable.length, label: '' }));
      const before = offlineIndex(userId).courses[cohortId];
      saveCourse(userId, {
        cohortId, title, hub, savedAt: new Date().toISOString(),
        lessons: { ...(before?.lessons ?? {}), ...result.lessons },
        online: [...new Set([...(before?.online ?? []), ...plan.filter((i) => i.online).map((i) => i.lessonId)])],
        failed: result.failed,
      });
      window.dispatchEvent(new Event(CHANGED));
      if (result.failed.length) setError('partial');
    } catch {
      setError('failed');
    } finally {
      setProgress(null);
    }
  };
  return { progress, error, run };
}

export function CourseDownload({ cohortId, userId, title, hub, lang, lessonCount }: {
  cohortId: string; userId: string; title: string; hub: string; lang: Lang; lessonCount: number;
}) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const saved = useSaved(cohortId);
  const { progress, error, run } = useDownload({ cohortId, userId, title, hub });
  const count = saved ? Object.keys(saved.lessons).length : 0;
  const errors: Record<string, string> = {
    unsupported: t('This browser cannot save lessons. Try Chrome.', 'Wannan burauzar ba za ta iya ajiye darussa ba. Gwada Chrome.'),
    offline: t('Connect to the internet to download.', 'Haɗa da intanet domin saukewa.'),
    partial: t('Some lessons could not be saved. Try again on a better connection.', 'Ba a iya ajiye wasu darussa ba. Sake gwadawa da intanet mai kyau.'),
    failed: t('The download stopped. Try again.', 'Saukewar ta tsaya. Sake gwadawa.'),
  };

  return (
    <section aria-label={t('Offline', 'Ba tare da intanet ba')} className="mb-6 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span aria-hidden className={cx('flex size-11 shrink-0 items-center justify-center rounded-xl text-xl', count ? 'bg-teal-50' : 'bg-canvas')}>{count ? '✓' : '⬇'}</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{count ? t('Saved for offline', 'An ajiye don amfani ba tare da intanet ba') : t('Study without data', 'Yi karatu ba tare da data ba')}</p>
            <p className="text-sm text-muted">
              {count
                ? t(`${count} of ${lessonCount} open lessons on this phone · ${formatBytes(totalBytes(saved!))}`, `Darussa ${count} cikin ${lessonCount} suna wayar nan · ${formatBytes(totalBytes(saved!))}`)
                : t('Download on Wi-Fi, then read, watch and take quizzes anywhere. Quiz answers send when you are back online.',
                  'Sauke yayin da kake da Wi-Fi, sannan ka karanta, kalla kuma ka yi jarrabawa a ko’ina. Amsoshin jarrabawa za su tafi idan ka dawo kan intanet.')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Button size="sm" disabled={Boolean(progress)} onClick={() => run()}>{progress ? t('Downloading…', 'Ana saukewa…') : count ? t('Update download', 'Sabunta') : t('Download for offline', 'Sauke don amfani ba tare da intanet ba')}</Button>
          {count > 0 && !progress && (
            <Button size="sm" variant="ghost" onClick={async () => { await removeCourse(userId, cohortId); window.dispatchEvent(new Event(CHANGED)); }}>{t('Remove', 'Cire')}</Button>
          )}
        </div>
      </div>
      {progress && (
        <div className="mt-4" role="status">
          <div className="h-2 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}
            aria-label={t('Download progress', 'Ci gaban saukewa')}>
            <div className="h-full rounded-full bg-[linear-gradient(90deg,#7C3AED,#2E5BFF)] transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 5}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">{t(`Saving lesson ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`, `Ana ajiye darasi ${Math.min(progress.done + 1, progress.total)} cikin ${progress.total}…`)}</p>
        </div>
      )}
      {error && <p className="mt-3 text-sm font-semibold text-amber-800" role="alert">{errors[error]}</p>}
      {saved && saved.online.length > 0 && !progress && (
        <p className="mt-3 text-xs text-muted">{t(`${saved.online.length} video lesson${saved.online.length === 1 ? '' : 's'} on YouTube or Vimeo ${saved.online.length === 1 ? 'still needs' : 'still need'} the internet.`, `Darussan bidiyo ${saved.online.length} na YouTube ko Vimeo suna buƙatar intanet.`)}</p>
      )}
    </section>
  );
}

// A small button on each module: download just this module.
export function ModuleDownload({ cohortId, userId, title, hub, moduleId, lessonIds, lang }: {
  cohortId: string; userId: string; title: string; hub: string; moduleId: string; lessonIds: string[]; lang: Lang;
}) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const saved = useSaved(cohortId);
  const { progress, run } = useDownload({ cohortId, userId, title, hub });
  const all = lessonIds.length > 0 && lessonIds.every((id) => saved?.lessons[id] !== undefined || saved?.online.includes(id));
  if (!lessonIds.length) return null;
  if (all) return <span className="text-xs font-bold text-teal-700">✓ {t('Saved', 'An ajiye')}</span>;
  return (
    <button type="button" disabled={Boolean(progress)} onClick={() => run(moduleId)}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-blue hover:bg-blue-50 disabled:opacity-60">
      ⬇ {progress ? `${progress.done}/${progress.total}` : t('Download module', 'Sauke wannan sashe')}
    </button>
  );
}
