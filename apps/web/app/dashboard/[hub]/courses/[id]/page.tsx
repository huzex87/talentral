import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { Alert, Badge, Card, LinkButton, PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { AddModuleForm, CourseDetailsForm, PublishControl } from '../forms';
import { CourseOutline, type OutlineLesson as Lesson, type OutlineModule as Module } from './course-outline';
import { Eye } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { libraryNewer } from '@/lib/library';

export const metadata = { title: 'Course' };


export default async function CoursePage({ params, searchParams }: { params: Promise<{ hub: string; id: string }>; searchParams: Promise<{ created?: string; copied?: string }> }) {
  const { hub: slug, id } = await params;
  const { created, copied } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const data = await withUser(user.id, async (tx) => {
    const [course] = await tx<{ id: string; title: string; summary: string | null; status: 'draft' | 'published'; programme_id: string | null; track: string | null;
      source_course_id: string | null; copied_at: Date | null }[]>`
      select id, title, summary, status, programme_id, track, source_course_id, copied_at from public.courses where id = ${id} and tenant_id = ${hub.id}`;
    if (!course) return null;
    // A course taken from the library: has the library changed it since?
    const [source] = course.source_course_id
      ? await tx<{ updated_at: Date | null }[]>`select updated_at from app.library_courses(${hub.id}) where id = ${course.source_course_id}`
      : [];
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
    return { course, modules, lessons, cohorts, programmes, source };
  });
  if (!data) notFound();
  const { course, modules, lessons, cohorts, programmes, source } = data;
  const library = hub.kind === 'library';
  const newer = libraryNewer(source?.updated_at, course.copied_at);
  const notReady = lessons.filter((l) => !l.ready).length;

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader label={<Link href={`/dashboard/${slug}/courses`} className="hover:underline">← Courses</Link>} title={course.title}
        description={<span className="inline-flex flex-wrap items-center gap-2"><Badge tone={course.status === 'published' ? 'teal' : 'violet'}>{course.status === 'published' ? 'Published' : 'Draft'}</Badge>
          {modules.length} modules · {lessons.length} lessons · {cohorts.length ? `followed by ${cohorts.map((c) => c.name).join(', ')}` : 'no cohort follows it yet'}</span>}
        actions={<LinkButton variant="secondary" href={`/dashboard/${slug}/courses/${id}/preview`}><Eye aria-hidden />Preview as a learner</LinkButton>} />
      {copied && <Alert tone="teal" title="Added to your courses">This course is now yours, as a draft. Read through it, add your own examples, then publish it and choose it on a cohort’s page. <Link href={`/dashboard/${slug}/courses/${id}/preview`} className="font-semibold underline">Preview it as a learner</Link>.</Alert>}
      {course.source_course_id && !copied && (
        <Alert tone={newer ? 'amber' : 'blue'} title={newer ? 'The library has a newer version' : 'From the Talentral Course Library'}>
          {newer
            ? <>Talentral updated this course on {formatDate(source!.updated_at!)}, after you took it on {formatDate(course.copied_at!)}. Your copy and your changes stay as they are. <Link href={`/dashboard/${slug}/library/${course.source_course_id}`} className="font-semibold underline">See what is in the new version</Link> and take a fresh copy if you want it.</>
            : <>You took this course from the library{course.copied_at ? ` on ${formatDate(course.copied_at)}` : ''}. It is yours now: change anything, then publish it and choose it for a cohort.</>}
        </Alert>
      )}
      {library && <Alert tone="violet" title="Course Library">Every hub on Talentral can take a copy of this course once it is published. Changes reach hubs only when they take a fresh copy.</Alert>}
      {created && <Alert tone="violet" title="Course created">Add lessons to Week 1, add more modules, then publish. Choose the course on a cohort’s page so its learners can study it. <Link href={`/dashboard/${slug}/courses/${id}/preview`} className="font-semibold underline">Preview it as a learner</Link> at any time.</Alert>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <CourseOutline slug={slug} courseId={id} modules={modules} lessons={lessons} />
          <Card className="p-5"><AddModuleForm slug={slug} courseId={id} /></Card>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Publishing</h2>
            <p className="mb-3 mt-2 text-sm text-muted">{library ? (course.status === 'published' ? 'Hubs can find this course in the library and take a copy.' : 'Hubs cannot see a draft.') : course.status === 'published' ? 'Learners in cohorts following this course can study it.' : 'Only your team can see a draft.'}{notReady ? ` ${notReady} ${notReady === 1 ? 'lesson needs' : 'lessons need'} content.` : ''}</p>
            <PublishControl slug={slug} courseId={id} status={course.status} previewHref={`/dashboard/${slug}/courses/${id}/preview`} />
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">Details</h2>
            <CourseDetailsForm slug={slug} courseId={id} title={course.title} summary={course.summary} programmeId={course.programme_id} programmes={programmes} library={library} track={course.track} />
          </Card>
        </aside>
      </div>
    </div>
  );
}
