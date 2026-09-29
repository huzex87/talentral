// What is saved on this phone for offline study, and the small queue of progress made offline.
// Runs in the browser only. The service worker (public/sw.js) serves what is saved here.

export const PAGES_CACHE = 'talentral-pages';
export const MEDIA_CACHE = 'talentral-media';
const INDEX_KEY = 'talentral:offline';
const QUEUE_KEY = 'talentral:progress';

export interface SavedCourse {
  cohortId: string; title: string; hub: string; savedAt: string;
  // lesson id → bytes saved for its file (0 when it has none)
  lessons: Record<string, number>;
  // lessons whose video lives on YouTube or Vimeo and so needs a connection
  online: string[];
  failed: string[];
}
export interface OfflineIndex { userId: string; courses: Record<string, SavedCourse> }

function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

export function offlineIndex(userId?: string): OfflineIndex {
  const index = read<OfflineIndex>(INDEX_KEY, { userId: userId ?? '', courses: {} });
  return index;
}

export function saveCourse(userId: string, course: SavedCourse) {
  const index = offlineIndex(userId);
  write(INDEX_KEY, { userId, courses: { ...index.courses, [course.cohortId]: course } });
}

export async function removeCourse(userId: string, cohortId: string) {
  const index = offlineIndex(userId);
  const course = index.courses[cohortId];
  if (!course) return;
  const pages = await caches.open(PAGES_CACHE);
  const media = await caches.open(MEDIA_CACHE);
  for (const lesson of Object.keys(course.lessons)) {
    await pages.delete(`${location.origin}/learn/${cohortId}/${lesson}`);
    await media.delete(`${location.origin}/learn/media/${cohortId}/${lesson}`);
  }
  const { [cohortId]: _removed, ...rest } = index.courses;
  write(INDEX_KEY, { userId, courses: rest });
}

// Another person signed in on this phone: nothing of the previous learner's stays.
export async function clearOffline() {
  try { localStorage.removeItem(INDEX_KEY); localStorage.removeItem(QUEUE_KEY); } catch { /* ignore */ }
  if ('caches' in window) await Promise.all([caches.delete(PAGES_CACHE), caches.delete(MEDIA_CACHE)]);
}

export function totalBytes(course: SavedCourse): number {
  return Object.values(course.lessons).reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------- progress made offline

export interface QueuedProgress { cohortId: string; lessonId: string; at: string }

export function queuedProgress(): QueuedProgress[] {
  return read<QueuedProgress[]>(QUEUE_KEY, []);
}

export function queueProgress(item: Omit<QueuedProgress, 'at'>) {
  const queue = queuedProgress().filter((q) => q.lessonId !== item.lessonId);
  write(QUEUE_KEY, [...queue, { ...item, at: new Date().toISOString() }]);
  window.dispatchEvent(new Event('talentral:queue'));
}

export function isQueued(lessonId: string): boolean {
  return queuedProgress().some((q) => q.lessonId === lessonId);
}

export function dropQueued(lessonId: string) {
  write(QUEUE_KEY, queuedProgress().filter((q) => q.lessonId !== lessonId));
  window.dispatchEvent(new Event('talentral:queue'));
}
