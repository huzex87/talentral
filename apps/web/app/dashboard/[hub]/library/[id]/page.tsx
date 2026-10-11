import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { LESSON_KINDS } from '@talentral/domain';
import { BookOpen, CheckCircle2, Clock, Languages, ListChecks, PenLine, PlayCircle, Sparkles } from 'lucide-react';
import { Alert, Badge, Card, LinkButton, PageHeader } from '@/components/ui';
import { LessonIcon } from '@/components/lesson-icon';
import { SubmitButton } from '@/components/submit-button';
import { requireHubRole } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { hausaLabel, libraryNewer, studyTime, type LibraryCourse, type LibraryOutline } from '@/lib/library';
import { takeLibraryCourse } from '../actions';

export const metadata = { title: 'Library course' };

const unlockLabel = (days: number | null) => (days === null || days === 0 ? null : days % 7 === 0 ? `Opens in week ${days / 7 + 1}` : `Opens on day ${days + 1}`);

// One library course: what it teaches, module by module, and the button that makes it the hub's own.
export default async function LibraryCoursePage({ params }: { params: Promise<{ hub: string; id: string }> }) {
  const { hub: slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  if (hub.kind !== 'hub') notFound();
  const data = await withUser(user.id, async (tx) => {
    const [row] = await tx<{ o: LibraryOutline | null }[]>`select app.library_outline(${hub.id}, ${id}) as o`;
    const [card] = await tx<LibraryCourse[]>`select * from app.library_courses(${hub.id}) where id = ${id}`;
    return row?.o && card ? { outline: row.o, card } : null;
  });
  if (!data) notFound();
  const { outline, card } = data;
  const hausa = hausaLabel(card);
  const newer = card.copy_id ? libraryNewer(card.updated_at, card.copied_at) : false;
  const take = takeLibraryCourse.bind(null, slug, id);
  const facts = [
    { icon: BookOpen, label: `${card.modules} ${card.modules === 1 ? 'module' : 'modules'}, ${card.lessons} lessons` },
    card.minutes > 0 && { icon: Clock, label: `About ${studyTime(card.minutes)} of study` },
    card.videos > 0 && { icon: PlayCircle, label: `${card.videos} ${card.videos === 1 ? 'video' : 'videos'}` },
    card.quizzes > 0 && { icon: ListChecks, label: `${card.quizzes} ${card.quizzes === 1 ? 'quiz' : 'quizzes'}, marked automatically` },
    card.assignments > 0 && { icon: PenLine, label: `${card.assignments} ${card.assignments === 1 ? 'assignment' : 'assignments'} with marking rubrics` },
    hausa && { icon: Languages, label: hausa },
  ].filter(Boolean) as { icon: typeof BookOpen; label: string }[];

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader label={<Link href={`/dashboard/${slug}/library`} className="hover:underline">← Course library</Link>} title={outline.title}
        description={<span className="inline-flex flex-wrap items-center gap-2">{outline.track && <Badge tone="blue">{outline.track}</Badge>}<span>Updated {formatDate(card.updated_at)}</span></span>} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {outline.summary && <p className="text-[15px] leading-relaxed text-ink-2">{outline.summary}</p>}
          {outline.modules.map((m, i) => (
            <Card key={m.id} className="overflow-hidden">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line bg-canvas/60 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Module {i + 1}</p>
                  <h2 className="font-semibold">{m.title}</h2>
                  {m.title_ha && <p className="text-sm text-violet" lang="ha">{m.title_ha}</p>}
                </div>
                {unlockLabel(m.unlock_after_days) && <Badge>{unlockLabel(m.unlock_after_days)}</Badge>}
              </div>
              {m.lessons.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No lessons in this module yet.</p> : (
                <ol className="divide-y divide-line">
                  {m.lessons.map((l) => (
                    <li key={l.id} className="flex items-start gap-3 px-5 py-3">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><LessonIcon kind={l.kind} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{l.title}</p>
                        {l.title_ha && <p className="text-sm text-muted" lang="ha">{l.title_ha}</p>}
                        <p className="mt-0.5 text-xs text-muted">
                          {LESSON_KINDS[l.kind]}
                          {l.minutes ? ` · ${l.minutes} min` : ''}
                          {l.kind === 'quiz' && l.questions ? ` · ${l.questions} ${l.questions === 1 ? 'question' : 'questions'}` : ''}
                          {l.kind === 'assignment' && l.rubric ? ` · rubric with ${l.rubric} ${l.rubric === 1 ? 'criterion' : 'criteria'}` : ''}
                        </p>
                      </div>
                      {l.hausa && <Badge tone="violet">Hausa</Badge>}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          ))}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="relative overflow-hidden p-5">
            <div className="brand-hairline absolute inset-x-0 top-0 h-[3px]" aria-hidden />
            <h2 className="text-sm font-semibold text-ink">What you get</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {facts.map((f) => <li key={f.label} className="flex items-start gap-2"><f.icon className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden strokeWidth={1.75} />{f.label}</li>)}
            </ul>
            <div className="mt-5 space-y-3 border-t border-line pt-4">
              {card.copy_id ? (
                <>
                  <p className="flex items-start gap-2 text-sm text-teal-700"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />In your courses since {formatDate(card.copied_at)}.</p>
                  {newer && <Alert tone="amber">Talentral has updated this course since then. Take a fresh copy to get the changes; your current copy stays as it is.</Alert>}
                  <LinkButton href={`/dashboard/${slug}/courses/${card.copy_id}`} className="w-full">Open your copy</LinkButton>
                  <form action={take}><SubmitButton variant="secondary" className="w-full" pendingLabel="Copying the course…">Take a fresh copy</SubmitButton></form>
                </>
              ) : (
                <>
                  <form action={take}><SubmitButton className="w-full" pendingLabel="Copying the course…"><Sparkles aria-hidden />Use this course</SubmitButton></form>
                  <p className="text-xs leading-relaxed text-muted">The whole course, with its videos, quizzes and rubrics, is added to your courses as a draft. Nothing reaches learners until you publish it and choose it for a cohort.</p>
                </>
              )}
            </div>
          </Card>
          <Card className="p-5 text-sm">
            <h2 className="font-semibold text-ink">Teaching it</h2>
            <p className="mt-2 text-muted">Your facilitators run the live classes and mark assignments; the lessons, videos and quizzes do the rest. You can change any lesson, add your own examples, and set when each module opens.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
