'use client';
import { useEffect, useState } from 'react';
import { formatBytes } from '@talentral/domain';
import { offlineIndex, totalBytes, type SavedCourse } from '@/lib/offline';

export function SavedCourses() {
  const [courses, setCourses] = useState<SavedCourse[] | null>(null);
  useEffect(() => { setCourses(Object.values(offlineIndex().courses)); }, []);
  if (!courses) return null;
  return (
    <section className="mt-6" aria-label="Downloaded courses">
      <h2 className="mb-3 text-sm font-semibold text-ink">Downloaded · An sauke</h2>
      {courses.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white p-5 text-center text-sm text-muted">
          Nothing downloaded yet. When you are online, open a course and tap “Download for offline”.
          <span className="mt-1 block" lang="ha">Babu abin da aka sauke tukuna. Idan kana kan intanet, buɗe darasi ka danna “Sauke don amfani ba tare da intanet ba”.</span>
        </p>
      ) : (
        <ul className="space-y-2">
          {courses.map((c) => (
            <li key={c.cohortId}>
              <a href={`/learn/${c.cohortId}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-4 transition hover:border-blue/40">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{c.title}</span>
                  <span className="text-xs text-muted">{c.hub} · {Object.keys(c.lessons).length} lessons · {formatBytes(totalBytes(c))}</span>
                </span>
                <span aria-hidden className="text-blue">→</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => location.reload()} className="mt-6 w-full rounded-[var(--radius-control)] bg-blue px-5 py-3 font-semibold text-white">Try again · Sake gwadawa</button>
    </section>
  );
}
