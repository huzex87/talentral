import Link from 'next/link';
import { embedUrl } from '@/lib/stream';
import { StreamPlayer } from './stream-player';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { LESSON_KINDS, LESSON_KINDS_HA, formatBytes, label, pick, renderLessonText, videoEmbedUrl, type LessonKind, type RubricCriterion } from '@talentral/domain';
import { LearnerShell } from '@/components/learner-shell';
import { Card, LinkButton } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { learnerCourses, learnerLanguage, outline, tutorHistory } from '@/lib/learn-data';
import { tutorEnabled } from '@/lib/tutor';
import { TutorPanel } from '../tutor';
import { AssignmentPanel, CompleteButton, PeerReviewTasks, QuizPlayer, RubricGuide, type PeerTask } from './players';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';

export const metadata = { title: 'Lesson' };

type LessonData = {
  id: string; kind: LessonKind; title: string; title_ha: string | null; body: string | null; body_ha: string | null; media_url: string | null;
  has_file: boolean; file_name: string | null; file_type: string | null; file_size: number | null; minutes: number | null; pass_mark: number; max_attempts: number | null;
  submission_types: string[]; questions: never[]; attempts: never[]; submissions: never[]; completed: boolean; rubric: RubricCriterion[]; peer_reviews: number;
};

export default async function LessonPage({ params }: { params: Promise<{ cohort: string; lesson: string }> }) {
  const { cohort, lesson } = await params;
  if (!/^[0-9a-f-]{36}$/.test(cohort) || !/^[0-9a-f-]{36}$/.test(lesson)) notFound();
  const user = await requireUser();
  const data = await withUser(user.id, async (tx) => {
    const [row] = await tx<{ l: LessonData | null }[]>`select app.learner_lesson(${cohort}, ${lesson}) as l`;
    if (!row?.l) return null;
    await tx`select app.record_progress(${cohort}, ${lesson}, false)`;
    const course = (await learnerCourses(tx)).find((c) => c.cohort_id === cohort)!;
    const rows = await outline(tx, cohort);
    const review = row.l.kind === 'quiz' ? await tx<{ question_id: string; correct: string[]; explanation: string | null }[]>`select * from app.quiz_review(${cohort}, ${lesson})` : [];
    // Handing out peer reviews happens here, once the learner has handed in their own work.
    const peerTasks = row.l.kind === 'assignment' && row.l.peer_reviews > 0 ? await tx<PeerTask[]>`select * from app.my_peer_tasks(${cohort}, ${lesson})` : [];
    const [stream] = row.l.kind === 'video' ? await tx<{ stream_id: string; stream_status: string; stream_renditions: string[] }[]>`select * from app.lesson_stream(${cohort}, ${lesson})` : [];
    const tutor = tutorEnabled() ? await tutorHistory(tx, cohort, 3) : null;
    return { l: row.l, course, rows, review, peerTasks, stream: stream?.stream_status === 'ready' ? stream : null, language: await learnerLanguage(tx, user.id), tutor };
  });
  if (!data) notFound();
  const { l, course, rows, review, peerTasks, stream, language: lang, tutor } = data;
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const title = pick(l.title, l.title_ha, lang);
  const body = pick(l.body, l.body_ha, lang);
  const html = renderLessonText(body.text);
  const embed = videoEmbedUrl(l.media_url);
  const media = `/learn/media/${cohort}/${lesson}`;
  const open = rows.filter((r) => r.open);
  const i = open.findIndex((r) => r.lesson_id === lesson);
  const prev = i > 0 ? open[i - 1] : null;
  const next = i >= 0 && i < open.length - 1 ? open[i + 1] : null;
  const graded = l.kind === 'quiz' || l.kind === 'assignment';

  return (
    <LearnerShell user={user} language={lang} active="learn" tabs={false}>
      <div className="mx-auto max-w-3xl">
        <Link href={`/learn/${cohort}`} className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-ink"><ChevronLeft className="size-4" aria-hidden />{course.course_title}</Link>
        <p className="mt-3 text-[13px] font-medium text-muted">{label(LESSON_KINDS, LESSON_KINDS_HA, l.kind, lang)}{l.minutes ? ` · ${l.minutes} ${t('min', 'minti')}` : ''}</p>
        <h1 className="mt-1 text-3xl font-semibold leading-tight">{title.text}</h1>
        {lang === 'ha' && (title.fallback || (body.fallback && l.body)) && <p className="mt-2 inline-block rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">{t('', 'Babu fassarar Hausa tukuna. Ana nuna Turanci.')}</p>}

        <div className="mt-6 space-y-6">
          {l.kind === 'video' && stream && <StreamPlayer embed={embedUrl(stream.stream_id)} small={media} title={title.text} renditions={stream.stream_renditions} lang={lang} />}
          {l.kind === 'video' && !stream && (embed
            ? <div className="aspect-video overflow-hidden rounded-xl bg-ink shadow-lg"><iframe src={embed} title={title.text} className="size-full" allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" /></div>
            : l.has_file && <video controls preload="metadata" className="w-full rounded-xl bg-ink shadow-lg" src={media} />)}
          {l.kind === 'audio' && l.has_file && (
            <Card className="p-5"><audio controls preload="metadata" className="w-full" src={media} /><p className="mt-2 text-xs text-muted">{l.file_name} · {formatBytes(l.file_size)}</p></Card>
          )}
          {l.kind === 'pdf' && l.has_file && (
            <Card className="overflow-hidden">
              <object data={media} type="application/pdf" className="hidden h-[70vh] w-full md:block" aria-label={title.text} />
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <span className="text-sm"><b className="inline-flex items-center gap-1.5"><FileText className="size-4 text-muted" aria-hidden />{l.file_name}</b> <span className="text-muted">· {formatBytes(l.file_size)}</span></span>
                <span className="flex gap-2">
                  <LinkButton href={media} target="_blank" size="sm" variant="secondary">{t('Open', 'Buɗe')}</LinkButton>
                  <LinkButton href={`${media}?download=1`} size="sm" variant="ghost">{t('Download', 'Sauke')}</LinkButton>
                </span>
              </div>
            </Card>
          )}
          {html && <article className="lesson-prose rounded-[var(--radius-card)] border border-line bg-white p-5 sm:p-7" dangerouslySetInnerHTML={{ __html: html }} />}
          {l.kind === 'quiz' && <QuizPlayer cohortId={cohort} lessonId={lesson} questions={l.questions} attempts={l.attempts} maxAttempts={l.max_attempts} passMark={l.pass_mark} review={review} lang={lang} />}
          {l.kind === 'assignment' && <RubricGuide rubric={l.rubric} lang={lang} />}
          {l.kind === 'assignment' && <AssignmentPanel cohortId={cohort} lessonId={lesson} types={l.submission_types} submissions={l.submissions} lang={lang} rubric={l.rubric} />}
          {l.kind === 'assignment' && l.peer_reviews > 0 && l.submissions.length > 0 && <PeerReviewTasks tasks={peerTasks} rubric={l.rubric} lang={lang} />}
        </div>

        {/* On phones the lesson controls sit in a bar above the home bar, in reach of the thumb;
            from small screens up they close the page. */}
        <nav aria-label={t('Lesson navigation', 'Kewayawa')}
          className="app-chrome fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-black/[0.06] bg-white/90 px-3 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-10px_30px_-18px_rgba(16,24,40,0.28)] backdrop-blur-xl backdrop-saturate-150 sm:static sm:z-auto sm:mt-8 sm:flex-wrap sm:justify-between sm:gap-3 sm:border-line sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-5 sm:shadow-none sm:backdrop-blur-none">
          {prev
            ? <LinkButton href={`/learn/${cohort}/${prev.lesson_id}`} variant="ghost" aria-label={`${t('Previous', 'Na baya')}: ${pick(prev.title, prev.title_ha, lang).text}`} className="max-sm:size-11 max-sm:border max-sm:border-line-strong max-sm:bg-white max-sm:px-0">
                <ChevronLeft aria-hidden /><span className="hidden sm:inline">{pick(prev.title, prev.title_ha, lang).text}</span>
              </LinkButton>
            : <span className="hidden sm:block" />}
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none sm:flex-wrap">
            {!graded && <CompleteButton cohortId={cohort} lessonId={lesson} done={l.completed} lang={lang} className="max-sm:h-11 max-sm:flex-1" />}
            {next && (
              <LinkButton href={`/learn/${cohort}/${next.lesson_id}`} variant={graded || l.completed ? 'primary' : 'secondary'} aria-label={`${t('Next', 'Na gaba')}: ${pick(next.title, next.title_ha, lang).text}`}
                className={graded || l.completed ? 'max-sm:h-11 max-sm:flex-1' : 'max-sm:h-11'}>
                <span className="sm:hidden">{t('Next', 'Na gaba')}</span>
                <span className="hidden sm:inline">{t('Next', 'Na gaba')}: {pick(next.title, next.title_ha, lang).text}</span>
                <ChevronRight aria-hidden />
              </LinkButton>
            )}
          </div>
        </nav>
        {tutor && <div className="mt-10"><TutorPanel cohortId={cohort} lessonId={lesson} lang={lang} history={tutor} /></div>}
      </div>
    </LearnerShell>
  );
}
