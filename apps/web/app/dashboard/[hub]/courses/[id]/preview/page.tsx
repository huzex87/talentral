// The course as learners see it, for the hub team: every module and lesson, with its content,
// before (or after) publishing. Read-only: nothing here is recorded as a learner's progress.
import Link from 'next/link';
import { embedUrl } from '@/lib/stream';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { LESSON_KINDS, QUESTION_KINDS, renderLessonText, videoEmbedUrl, type LessonKind, type QuestionKind, type QuizOption } from '@talentral/domain';
import { Alert, Badge, LinkButton, cx } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';

export const metadata = { title: 'Course preview' };

const ICON: Record<LessonKind, string> = { text: '📖', video: '🎬', audio: '🎧', pdf: '📄', quiz: '✅', assignment: '📝' };

type Lesson = {
  id: string; module_id: string; kind: LessonKind; title: string; title_ha: string | null; body: string | null; body_ha: string | null;
  media_url: string | null; file_name: string | null; file_type: string | null; has_file: boolean; minutes: number | null; stream_id: string | null; stream_status: string | null;
  pass_mark: number; max_attempts: number | null; submission_types: string[];
};

export default async function CoursePreview({ params, searchParams }: { params: Promise<{ hub: string; id: string }>; searchParams: Promise<{ lesson?: string; lang?: string }> }) {
  const { hub: slug, id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const data = await withUser(user.id, async (tx) => {
    const [course] = await tx<{ title: string; summary: string | null; status: 'draft' | 'published' }[]>`
      select title, summary, status from public.courses where id = ${id} and tenant_id = ${hub.id}`;
    if (!course) return null;
    const modules = await tx<{ id: string; title: string; title_ha: string | null; unlock_after_days: number | null }[]>`
      select id, title, title_ha, unlock_after_days from public.course_modules where course_id = ${id} order by position, created_at`;
    const lessons = await tx<Lesson[]>`
      select l.id, l.module_id, l.kind, l.title, l.title_ha, l.body, l.body_ha, l.media_url, l.file_name, l.file_type, l.file_path is not null as has_file, l.stream_id, l.stream_status,
        l.minutes, l.pass_mark, l.max_attempts, l.submission_types
      from public.lessons l join public.course_modules m on m.id = l.module_id where l.course_id = ${id} order by m.position, m.created_at, l.position, l.created_at`;
    return { course, modules, lessons };
  });
  if (!data) notFound();
  const { course, modules, lessons } = data;
  const ha = sp.lang === 'ha';
  const current = lessons.find((l) => l.id === sp.lesson) ?? lessons[0] ?? null;
  const questions = current?.kind === 'quiz' ? await withUser(user.id, (tx) => tx<{ id: string; kind: QuestionKind; prompt: string; prompt_ha: string | null; options: QuizOption[]; points: number }[]>`
    select id, kind, prompt, prompt_ha, options, points from public.quiz_questions where lesson_id = ${current.id} order by position, id`) : [];
  const index = current ? lessons.findIndex((l) => l.id === current.id) : -1;
  const prev = index > 0 ? lessons[index - 1] : null;
  const next = index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null;
  const href = (lessonId: string, lang = ha ? 'ha' : 'en') => `/dashboard/${slug}/courses/${id}/preview?lesson=${lessonId}${lang === 'ha' ? '&lang=ha' : ''}`;
  const pick = (en: string | null, hau: string | null) => (ha && hau?.trim() ? hau : en);
  const body = current ? pick(current.body, current.body_ha) : null;
  const streamed = current?.kind === 'video' && current.stream_status === 'ready' && current.stream_id ? current.stream_id : null;
  const embed = streamed ? embedUrl(streamed) : current ? videoEmbedUrl(current.media_url) : null;
  const fileUrl = current?.has_file ? `/dashboard/${slug}/courses/file/${current.id}` : null;

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet/25 bg-violet-50 px-4 py-3" role="status">
        <p className="text-sm text-violet"><b>Preview.</b> This is how learners see <b>{course.title}</b>. Nothing you do here counts as a learner’s progress.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={course.status === 'published' ? 'teal' : 'amber'}>{course.status === 'published' ? 'Published' : 'Draft: learners cannot see it yet'}</Badge>
          <LinkButton size="sm" variant="secondary" href={`/dashboard/${slug}/courses/${id}`}>Back to editing</LinkButton>
        </div>
      </div>

      {lessons.length === 0 ? <Alert tone="amber" title="Nothing to preview yet">Add a lesson to the course, then preview it here.</Alert> : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <nav aria-label="Course outline" className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div>
              <h1 className="font-display text-xl font-semibold">{course.title}</h1>
              {course.summary && <p className="mt-1 text-sm text-muted">{course.summary}</p>}
            </div>
            <div className="flex rounded-lg bg-canvas p-0.5 text-xs font-semibold" role="group" aria-label="Language">
              {(['en', 'ha'] as const).map((l) => (
                <Link key={l} href={current ? href(current.id, l) : '#'} aria-current={(l === 'ha') === ha ? 'true' : undefined}
                  className={cx('flex-1 rounded-md px-3 py-1 text-center', (l === 'ha') === ha ? 'bg-white text-ink shadow-sm' : 'text-muted')}>{l === 'en' ? 'English' : 'Hausa'}</Link>
              ))}
            </div>
            {modules.map((m) => {
              const list = lessons.filter((l) => l.module_id === m.id);
              return (
                <div key={m.id}>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{pick(m.title, m.title_ha)}</p>
                  {m.unlock_after_days !== null && <p className="text-[11px] text-muted">Opens {m.unlock_after_days} days after the cohort starts</p>}
                  <ol className="mt-1.5 space-y-0.5">
                    {list.map((l) => (
                      <li key={l.id}>
                        <Link href={href(l.id)} aria-current={l.id === current?.id ? 'page' : undefined}
                          className={cx('flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm', l.id === current?.id ? 'bg-blue-50 font-semibold text-blue' : 'hover:bg-canvas')}>
                          <span aria-hidden>{ICON[l.kind]}</span><span className="min-w-0 flex-1 truncate">{pick(l.title, l.title_ha)}</span>
                        </Link>
                      </li>
                    ))}
                    {list.length === 0 && <li className="px-2.5 py-2 text-xs text-muted">No lessons yet</li>}
                  </ol>
                </div>
              );
            })}
          </nav>

          {current && (
            <article className="min-w-0 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-8" aria-label="Lesson preview">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">{LESSON_KINDS[current.kind]}{current.minutes ? ` · about ${current.minutes} min` : ''}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold">{pick(current.title, current.title_ha)}</h2>
              {ha && !current.body_ha?.trim() && current.body?.trim() && <p className="mt-2 text-xs text-amber-800">No Hausa text yet: learners reading in Hausa see the English.</p>}

              <div className="mt-5 space-y-5">
                {embed && <div className="aspect-video overflow-hidden rounded-xl bg-ink"><iframe src={embed} title={current.title} className="size-full" allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" /></div>}
                {fileUrl && current.kind === 'video' && !embed && !streamed && <video controls preload="metadata" className="w-full rounded-xl bg-ink" src={fileUrl} />}
                {streamed && !embed && <Alert tone="teal">Streamed video ready. Learners watch it in the adaptive player.</Alert>}
                {current.kind === 'video' && current.stream_status && current.stream_status !== 'ready' && <Alert tone="blue">The streamed video is still being prepared. Learners see it once it is ready.</Alert>}
                {fileUrl && current.kind === 'audio' && <audio controls preload="metadata" className="w-full" src={fileUrl} />}
                {fileUrl && current.kind === 'pdf' && <a href={fileUrl} target="_blank" className="inline-flex items-center gap-2 rounded-xl border border-line px-4 py-3 font-semibold text-blue hover:bg-canvas">📄 Open {current.file_name ?? 'the PDF'} ↗</a>}
                {body?.trim() ? <div className="lesson-prose" dangerouslySetInnerHTML={{ __html: renderLessonText(body) }} />
                  : !embed && !fileUrl && !streamed && current.kind !== 'quiz' && <Alert tone="amber">This lesson has no content yet. Learners would see an empty page.</Alert>}

                {current.kind === 'quiz' && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted">Pass mark {current.pass_mark}%{current.max_attempts ? ` · ${current.max_attempts} attempts` : ' · unlimited attempts'}. Right answers are hidden here, as they are for learners.</p>
                    {questions.length === 0 ? <Alert tone="amber">No questions yet.</Alert> : (
                      <ol className="space-y-4">
                        {questions.map((q, i) => (
                          <li key={q.id} className="rounded-xl border border-line p-4">
                            <p className="font-semibold">{i + 1}. {pick(q.prompt, q.prompt_ha)}</p>
                            <p className="mt-0.5 text-xs text-muted">{QUESTION_KINDS[q.kind]} · {q.points} {q.points === 1 ? 'point' : 'points'}</p>
                            <ul className="mt-2 space-y-1.5">
                              {q.options.map((o) => (
                                <li key={o.id} className="flex items-center gap-2 text-sm">
                                  <span aria-hidden className={cx('inline-block size-4 border border-line', q.kind === 'multiple' ? 'rounded' : 'rounded-full')} />{pick(o.text, o.text_ha ?? null)}
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
                {current.kind === 'assignment' && (
                  <p className="rounded-xl bg-canvas/70 p-4 text-sm">Learners hand in: {current.submission_types.map((t) => ({ text: 'a written answer', link: 'a link', file: 'a file' } as Record<string, string>)[t] ?? t).join(', ')}.</p>
                )}
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                {prev ? <Link href={href(prev.id)} className="text-sm font-semibold text-blue hover:underline">← {prev.title}</Link> : <span />}
                <LinkButton size="sm" variant="ghost" href={`/dashboard/${slug}/courses/${id}/lessons/${current.id}`}>Edit this lesson</LinkButton>
                {next ? <Link href={href(next.id)} className="text-sm font-semibold text-blue hover:underline">{next.title} →</Link> : <span />}
              </div>
            </article>
          )}
        </div>
      )}
    </div>
  );
}
