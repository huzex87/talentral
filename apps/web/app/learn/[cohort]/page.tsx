import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { LESSON_KINDS, LESSON_KINDS_HA, label, pathProgress, pick, type LessonKind } from '@talentral/domain';
import { LearnerShell } from '@/components/learner-shell';
import { Card, LinkButton, cx } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { CourseDownload, ModuleDownload } from './offline-download';
import { learnerCourses, learnerLanguage, nextLesson, outline, type OutlineRow } from '@/lib/learn-data';

export const metadata = { title: 'Course' };

const ICON: Record<LessonKind, string> = { text: '📖', video: '🎬', audio: '🎧', pdf: '📄', quiz: '✅', assignment: '📝' };

function status(r: OutlineRow, t: (en: string, ha: string) => string): [string, string] {
  if (!r.open) return [t('Locked', 'A rufe'), 'text-muted'];
  if (r.kind === 'assignment' && r.submission_status === 'graded') return [t('Graded', 'An duba'), 'text-teal-700'];
  if (r.kind === 'assignment' && r.submission_status === 'submitted') return [t('Handed in', 'An mika'), 'text-blue'];
  if (r.kind === 'assignment' && r.submission_status === 'resubmit') return [t('Try again', 'Sake gwadawa'), 'text-amber-800'];
  if (r.completed) return [t('Done', 'An gama'), 'text-teal-700'];
  return ['', ''];
}

export default async function CourseOutline({ params }: { params: Promise<{ cohort: string }> }) {
  const { cohort } = await params;
  if (!/^[0-9a-f-]{36}$/.test(cohort)) notFound();
  const user = await requireUser();
  const data = await withUser(user.id, async (tx) => {
    const course = (await learnerCourses(tx)).find((c) => c.cohort_id === cohort);
    if (!course?.course_id) return null;
    return { course, rows: await outline(tx, cohort), language: await learnerLanguage(tx, user.id) };
  });
  if (!data) notFound();
  const { course, rows, language: lang } = data;
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const next = nextLesson(rows);
  const pct = course.lessons ? Math.round((course.completed / course.lessons) * 100) : 0;
  // A path groups its courses in order; a single course is one group without a heading.
  const courses = [...new Map(rows.map((r) => [r.course_id, r])).values()];
  const isPath = Boolean(course.path_id);
  const groups = courses.map((c) => {
    const lessons = rows.filter((r) => r.course_id === c.course_id);
    return { ...c, rows: lessons, done: lessons.filter((l) => l.completed || l.submission_status).length };
  });
  const progress = pathProgress(groups.map((g) => ({ lessons: g.rows.length, done: g.done, open: g.course_open })));
  const title = isPath ? pick(course.path_title ?? '', course.path_title_ha, lang).text : course.course_title;

  return (
    <LearnerShell user={user} language={lang} active="learn">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link href="/learn" className="text-sm font-semibold text-violet hover:underline">← {t('My learning', 'Karatuna')}</Link>
          {isPath && <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-violet">{t('Learning path', 'Hanyar koyo')}</p>}
          <h1 className="mt-1 text-3xl font-semibold">{title}</h1>
          <p className="mt-1 text-[15px] text-muted">{course.hub_name} · {course.cohort_name} · {pct}% {t('complete', 'an kammala')}
            {isPath && ` · ${t(`course ${progress.current + 1} of ${progress.total}`, `kwas ${progress.current + 1} cikin ${progress.total}`)}`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton variant="secondary" href={`/learn/${cohort}/discussion`}>💬 {t('Discussion', 'Tattaunawa')}</LinkButton>
          {next && <LinkButton href={`/learn/${cohort}/${next.lesson_id}`}>{course.completed ? t('Continue', 'Ci gaba') : t('Start the course', 'Fara darasin')}</LinkButton>}
        </div>
      </div>
      {isPath && (
        <ol className="mb-6 grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]" aria-label={t('Courses in this path', 'Kwasakwasai a wannan hanya')}>
          {groups.map((g, i) => {
            const finished = g.rows.length > 0 && g.done >= g.rows.length;
            return (
              <li key={g.course_id} aria-current={i === progress.current ? 'step' : undefined}
                className={cx('rounded-xl border p-3', finished ? 'border-teal-700/20 bg-teal-50' : i === progress.current ? 'border-blue/40 bg-blue-50' : !g.course_open ? 'border-dashed border-line bg-canvas' : 'border-line bg-white')}>
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{t(`Course ${i + 1}`, `Kwas ${i + 1}`)}</p>
                <p className="mt-0.5 font-semibold leading-snug">{g.course_title}</p>
                <p className="mt-1 text-xs font-semibold text-muted">{finished ? `✓ ${t('Finished', 'An gama')}` : !g.course_open ? `🔒 ${t('Opens after the course before', 'Zai buɗe bayan kwas ɗin da ya gabata')}` : `${g.done} / ${g.rows.length} ${t('lessons', 'darussa')}`}</p>
              </li>
            );
          })}
        </ol>
      )}
      <CourseDownload cohortId={cohort} userId={user.id} title={title ?? ''} hub={course.hub_name} lang={lang} lessonCount={rows.filter((r) => r.open).length} />
      <div className="space-y-8">
        {groups.map((g, gi) => (
        <section key={g.course_id} aria-labelledby={isPath ? `course-${g.course_id}` : undefined} className="space-y-4">
          {isPath && (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`course-${g.course_id}`} className="text-xl font-semibold">{t(`Course ${gi + 1}`, `Kwas ${gi + 1}`)}: {g.course_title}</h2>
              {!g.course_open && <span className="text-sm font-semibold text-muted">🔒 {t('Finish the course before to open it', 'Kammala kwas ɗin da ya gabata domin buɗe shi')}</span>}
            </div>
          )}
        {[...new Map(g.rows.map((r) => [r.module_id, r])).values()].map((m) => {
          const lessons = rows.filter((r) => r.module_id === m.module_id);
          const locked = lessons.every((l) => !l.open);
          return (
            <Card key={m.module_id} className={cx('p-5', locked && 'bg-canvas/60')}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-semibold">{pick(m.module_title, m.module_title_ha, lang).text}</h2>
                {locked && m.opens_on && <span className="text-sm font-semibold text-muted">🔒 {t('Opens', 'Zai buɗe')} {formatDate(m.opens_on)}</span>}
                {!locked && <ModuleDownload cohortId={cohort} userId={user.id} title={title ?? ''} hub={course.hub_name} moduleId={m.module_id}
                  lessonIds={lessons.filter((l) => l.open).map((l) => l.lesson_id)} lang={lang} />}
              </div>
              <ol className="divide-y divide-line rounded-xl border border-line bg-white">
                {lessons.map((l) => {
                  const [statusText, tone] = status(l, t);
                  const inner = (
                    <>
                      <span aria-hidden className={cx('flex size-9 shrink-0 items-center justify-center rounded-full text-lg', l.completed || l.submission_status === 'graded' ? 'bg-teal-50' : 'bg-canvas')}>{l.completed ? '✓' : ICON[l.kind]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{pick(l.title, l.title_ha, lang).text}</span>
                        <span className="text-xs text-muted">{label(LESSON_KINDS, LESSON_KINDS_HA, l.kind, lang)}{l.minutes ? ` · ${l.minutes} ${t('min', 'minti')}` : ''}</span>
                      </span>
                      {statusText && <span className={cx('shrink-0 text-xs font-bold', tone)}>{statusText}</span>}
                    </>
                  );
                  return (
                    <li key={l.lesson_id}>
                      {l.open ? <Link href={`/learn/${cohort}/${l.lesson_id}`} className="flex items-center gap-3 px-3 py-3 transition hover:bg-canvas/60">{inner}</Link>
                        : <div className="flex items-center gap-3 px-3 py-3 opacity-60" aria-disabled>{inner}</div>}
                    </li>
                  );
                })}
              </ol>
            </Card>
          );
        })}
        </section>
        ))}
      </div>
    </LearnerShell>
  );
}
