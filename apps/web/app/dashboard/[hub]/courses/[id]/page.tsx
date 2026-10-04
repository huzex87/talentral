import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { LESSON_KINDS, type LessonKind } from '@talentral/domain';
import { Alert, Badge, Button, Card, LinkButton, PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { moveLesson, moveModule } from '../actions';
import { AddLessonForm, AddModuleForm, CourseDetailsForm, ModuleSettings, PublishControl } from '../forms';
import { Eye } from 'lucide-react';
import { LessonIcon } from '@/components/lesson-icon';

export const metadata = { title: 'Course' };


type Lesson = { id: string; module_id: string; kind: LessonKind; title: string; title_ha: string | null; minutes: number | null; ready: boolean; questions: number };
type Module = { id: string; title: string; title_ha: string | null; unlock_after_days: number | null };

export default async function CoursePage({ params, searchParams }: { params: Promise<{ hub: string; id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { hub: slug, id } = await params;
  const { created } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const data = await withUser(user.id, async (tx) => {
    const [course] = await tx<{ id: string; title: string; summary: string | null; status: 'draft' | 'published'; programme_id: string | null }[]>`
      select id, title, summary, status, programme_id from public.courses where id = ${id} and tenant_id = ${hub.id}`;
    if (!course) return null;
    const modules = await tx<Module[]>`select id, title, title_ha, unlock_after_days from public.course_modules where course_id = ${id} order by position, created_at`;
    const lessons = await tx<Lesson[]>`
      select l.id, l.module_id, l.kind, l.title, l.title_ha, l.minutes,
        case l.kind when 'text' then l.body is not null when 'video' then (l.media_url is not null or l.file_path is not null)
          when 'audio' then l.file_path is not null when 'pdf' then l.file_path is not null
          when 'quiz' then exists (select 1 from public.quiz_questions q where q.lesson_id = l.id) else l.body is not null end as ready,
        (select count(*)::int from public.quiz_questions q where q.lesson_id = l.id) as questions
      from public.lessons l where l.course_id = ${id} order by l.position, l.created_at`;
    const cohorts = await tx<{ id: string; name: string }[]>`select id, name from public.cohorts where course_id = ${id} order by created_at`;
    const programmes = await tx<{ id: string; title: string }[]>`select id, title from public.programmes where tenant_id = ${hub.id} order by created_at desc`;
    return { course, modules, lessons, cohorts, programmes };
  });
  if (!data) notFound();
  const { course, modules, lessons, cohorts, programmes } = data;
  const notReady = lessons.filter((l) => !l.ready).length;

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader label={<Link href={`/dashboard/${slug}/courses`} className="hover:underline">← Courses</Link>} title={course.title}
        description={<span className="inline-flex flex-wrap items-center gap-2"><Badge tone={course.status === 'published' ? 'teal' : 'violet'}>{course.status === 'published' ? 'Published' : 'Draft'}</Badge>
          {modules.length} modules · {lessons.length} lessons · {cohorts.length ? `followed by ${cohorts.map((c) => c.name).join(', ')}` : 'no cohort follows it yet'}</span>}
        actions={<LinkButton variant="secondary" href={`/dashboard/${slug}/courses/${id}/preview`}><Eye aria-hidden />Preview as a learner</LinkButton>} />
      {created && <Alert tone="violet" title="Course created">Add lessons to Week 1, add more modules, then publish. Choose the course on a cohort’s page so its learners can study it. <Link href={`/dashboard/${slug}/courses/${id}/preview`} className="font-semibold underline">Preview it as a learner</Link> at any time.</Alert>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {modules.map((m, mi) => {
            const list = lessons.filter((l) => l.module_id === m.id);
            return (
              <Card key={m.id} className="p-5">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-semibold">{m.title}</h2>
                    <p className="text-xs text-muted">{m.title_ha ? `${m.title_ha} · ` : ''}{m.unlock_after_days === null ? 'Open from the start' : `Opens ${m.unlock_after_days} days after the cohort starts`}</p>
                  </div>
                  <div className="flex gap-1">
                    <form action={moveModule.bind(null, slug, id, m.id, -1)}><Button variant="ghost" size="sm" disabled={mi === 0} aria-label={`Move ${m.title} up`}>↑</Button></form>
                    <form action={moveModule.bind(null, slug, id, m.id, 1)}><Button variant="ghost" size="sm" disabled={mi === modules.length - 1} aria-label={`Move ${m.title} down`}>↓</Button></form>
                  </div>
                </div>
                {list.length > 0 && (
                  <ol className="mb-3 divide-y divide-line rounded-xl border border-line" aria-label={`Lessons in ${m.title}`}>
                    {list.map((l, li) => (
                      <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-white text-muted"><LessonIcon kind={l.kind} /></span>
                        <Link href={`/dashboard/${slug}/courses/${id}/lessons/${l.id}`} className="min-w-0 flex-1">
                          <span className="block truncate font-semibold hover:text-blue">{l.title}</span>
                          <span className="text-xs text-muted">{LESSON_KINDS[l.kind]}{l.minutes ? ` · ${l.minutes} min` : ''}{l.kind === 'quiz' ? ` · ${l.questions} questions` : ''}{l.title_ha ? ' · Hausa ✓' : ''}</span>
                        </Link>
                        {!l.ready && <Badge tone="amber">Needs content</Badge>}
                        <span className="flex shrink-0">
                          <form action={moveLesson.bind(null, slug, id, m.id, l.id, -1)}><Button variant="ghost" size="sm" disabled={li === 0} aria-label={`Move ${l.title} up`}>↑</Button></form>
                          <form action={moveLesson.bind(null, slug, id, m.id, l.id, 1)}><Button variant="ghost" size="sm" disabled={li === list.length - 1} aria-label={`Move ${l.title} down`}>↓</Button></form>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                <AddLessonForm slug={slug} courseId={id} moduleId={m.id} />
                <div className="mt-3"><ModuleSettings slug={slug} courseId={id} module={m} /></div>
              </Card>
            );
          })}
          <Card className="p-5"><AddModuleForm slug={slug} courseId={id} /></Card>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Publishing</h2>
            <p className="mb-3 mt-2 text-sm text-muted">{course.status === 'published' ? 'Learners in cohorts following this course can study it.' : 'Only your team can see a draft.'}{notReady ? ` ${notReady} ${notReady === 1 ? 'lesson needs' : 'lessons need'} content.` : ''}</p>
            <PublishControl slug={slug} courseId={id} status={course.status} previewHref={`/dashboard/${slug}/courses/${id}/preview`} />
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">Details</h2>
            <CourseDetailsForm slug={slug} courseId={id} title={course.title} summary={course.summary} programmeId={course.programme_id} programmes={programmes} />
          </Card>
        </aside>
      </div>
    </div>
  );
}
