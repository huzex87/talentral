import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { BookOpen, Clock, Languages, Library, ListChecks, PenLine, PlayCircle } from 'lucide-react';
import { Badge, Card, EmptyState, PageHeader, cx } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { hausaLabel, studyTime, type LibraryCourse } from '@/lib/library';

export const metadata = { title: 'Course library' };

// Ready-made courses from Talentral, built once and taken by any hub as its own draft.
export default async function CourseLibrary({ params, searchParams }: { params: Promise<{ hub: string }>; searchParams: Promise<{ track?: string }> }) {
  const { hub: slug } = await params;
  const { track } = await searchParams;
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  if (hub.kind !== 'hub') notFound();
  const courses = await withUser(user.id, (tx) => tx<LibraryCourse[]>`select * from app.library_courses(${hub.id})`);
  const tracks = [...new Set(courses.map((c) => c.track).filter((t): t is string => Boolean(t)))];
  const shown = track ? courses.filter((c) => c.track === track) : courses;
  const taken = courses.filter((c) => c.copy_id).length;
  const href = (t?: string) => `/dashboard/${slug}/library${t ? `?track=${encodeURIComponent(t)}` : ''}`;

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader label={<Link href={`/dashboard/${slug}/courses`} className="hover:underline">← Courses</Link>} title="Course library"
        description="Ready-made courses from Talentral Faculty, taught in English and Hausa, with quizzes, assignments and marking rubrics. Take one and it becomes your own draft: change anything, then give it to a cohort." />

      <Card className="relative overflow-hidden p-5 sm:p-6">
        <div className="brand-hairline absolute inset-x-0 top-0 h-[3px]" aria-hidden />
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Library, tone: 'text-blue', title: 'Built once, by experts', body: 'Each course is written with a subject expert and tested with a real cohort before it reaches the library.' },
            { icon: Languages, tone: 'text-violet', title: 'Hausa and English', body: 'Lessons in both languages; learners switch with one tap. Videos have Hausa voice and English captions.' },
            { icon: PenLine, tone: 'text-teal-700', title: 'Yours to change', body: 'Your copy is a draft in your courses. Add your examples, your schedule and your own tutors.' },
          ].map((f) => (
            <div key={f.title} className="flex gap-3">
              <f.icon className={cx('mt-0.5 size-5 shrink-0', f.tone)} aria-hidden strokeWidth={1.75} />
              <div><p className="font-semibold">{f.title}</p><p className="mt-0.5 text-sm text-muted">{f.body}</p></div>
            </div>
          ))}
        </div>
      </Card>

      {courses.length === 0 ? (
        <EmptyState icon={Library} title="The first courses are on their way">
          Talentral Faculty is building the first library courses: digital skills foundations, digital marketing, data analysis and frontend web development. They will appear here as each one is ready.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {tracks.length > 1 ? (
              <nav aria-label="Tracks" className="-mx-1 flex flex-wrap gap-1.5">
                {[undefined, ...tracks].map((t) => {
                  const active = (t ?? null) === (track ?? null);
                  return (
                    <Link key={t ?? 'all'} href={href(t)} aria-current={active ? 'page' : undefined}
                      className={cx('tap rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                        active ? 'border-blue bg-blue text-white' : 'border-line bg-white text-ink-2 hover:border-blue/40 hover:text-blue')}>
                      {t ?? 'All tracks'}
                    </Link>
                  );
                })}
              </nav>
            ) : <span />}
            <p className="text-sm text-muted">{courses.length} {courses.length === 1 ? 'course' : 'courses'}{taken ? ` · ${taken} in your courses` : ''}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {shown.map((c) => {
              const hausa = hausaLabel(c);
              return (
                <Link key={c.id} href={`/dashboard/${slug}/library/${c.id}`} className="group">
                  <Card className="tap flex h-full flex-col p-5 transition hover:border-blue/40 hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-blue-600">{c.track ?? 'Course'}</p>
                      {c.copy_id && <Badge tone="teal">In your courses</Badge>}
                    </div>
                    <p className="mt-1.5 font-display text-lg font-semibold group-hover:text-blue">{c.title}</p>
                    {c.summary && <p className="mt-1 line-clamp-2 text-sm text-muted">{c.summary}</p>}
                    <div className="mt-auto pt-4">
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                        <span className="inline-flex items-center gap-1"><BookOpen className="size-3.5" aria-hidden />{c.modules} {c.modules === 1 ? 'module' : 'modules'} · {c.lessons} lessons</span>
                        {c.minutes > 0 && <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{studyTime(c.minutes)}</span>}
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {hausa && <Badge tone="violet"><Languages aria-hidden />{hausa}</Badge>}
                        {c.videos > 0 && <Badge><PlayCircle aria-hidden />{c.videos} {c.videos === 1 ? 'video' : 'videos'}</Badge>}
                        {c.quizzes > 0 && <Badge><ListChecks aria-hidden />{c.quizzes} {c.quizzes === 1 ? 'quiz' : 'quizzes'}</Badge>}
                        {c.assignments > 0 && <Badge><PenLine aria-hidden />{c.assignments} {c.assignments === 1 ? 'assignment' : 'assignments'}</Badge>}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
