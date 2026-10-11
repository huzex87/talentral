import Link from 'next/link';
import { withUser } from '@talentral/db';
import { Badge, Card, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { BookOpen, Library, Plus } from 'lucide-react';

export const metadata = { title: 'Courses' };

export default async function Courses({ params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const { courses } = await withUser(user.id, async (tx) => ({
    courses: await tx<{ id: string; title: string; status: 'draft' | 'published'; programme: string | null; track: string | null; from_library: boolean; modules: number; lessons: number; cohorts: number }[]>`
      select c.id, c.title, c.status, p.title as programme, c.track, c.source_course_id is not null as from_library,
        (select count(*)::int from public.course_modules m where m.course_id = c.id) as modules,
        (select count(*)::int from public.lessons l where l.course_id = c.id) as lessons,
        (select count(*)::int from public.cohorts co where co.course_id = c.id) as cohorts
      from public.courses c left join public.programmes p on p.id = c.programme_id
      where c.tenant_id = ${hub.id} order by c.updated_at desc`,
  }));
  const library = hub.kind === 'library';
  return (
    <div className="max-w-5xl space-y-6">
      {library ? (
        <PageHeader label="Talentral Course Library" title="Library courses" description="Courses every hub on Talentral can take as its own. Build them like any course, in English and Hausa, give each a track, and publish when it has been tested with a cohort."
          actions={<LinkButton href={`/dashboard/${slug}/courses/new`}><Plus aria-hidden />New library course</LinkButton>} />
      ) : (
        <PageHeader label="Learning" title="Courses" description="Build courses from modules and lessons: reading, video, audio, PDF, quizzes and assignments, in English and Hausa. Cohorts follow a course, and quizzes and assignments land in the gradebook."
          actions={<>
            <LinkButton variant="secondary" href={`/dashboard/${slug}/library`}><Library aria-hidden />Course library</LinkButton>
            <LinkButton href={`/dashboard/${slug}/courses/new`}><Plus aria-hidden />New course</LinkButton>
          </>} />
      )}
      {courses.length === 0 ? (library
        ? <EmptyState icon={BookOpen} title="No library courses yet" action={<LinkButton href={`/dashboard/${slug}/courses/new`}>New library course</LinkButton>}>Start with the outline from the course plan. Hubs see a course only once it is published.</EmptyState>
        : <EmptyState icon={BookOpen} title="No courses yet" action={<div className="flex flex-wrap justify-center gap-2"><LinkButton href={`/dashboard/${slug}/library`}><Library aria-hidden />Browse the course library</LinkButton><LinkButton variant="secondary" href={`/dashboard/${slug}/courses/new`}>Build your own</LinkButton></div>}>Take a ready-made course from the Talentral library, in English and Hausa, or build your own from modules and lessons. Cohorts follow a course.</EmptyState>) : (
        <div className="grid gap-3 md:grid-cols-2">
          {courses.map((c) => (
            <Link key={c.id} href={`/dashboard/${slug}/courses/${c.id}`}>
              <Card className="h-full p-5 transition hover:border-blue/40 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-lg font-semibold">{c.title}</p>
                  <Badge tone={c.status === 'published' ? 'teal' : 'violet'}>{c.status === 'published' ? 'Published' : 'Draft'}</Badge>
                </div>
                {(c.programme || c.track) && <p className="text-sm text-muted">{library ? c.track : c.programme}</p>}
                {c.from_library && <p className="mt-1.5"><Badge tone="blue"><Library aria-hidden />From the library</Badge></p>}
                <p className="mt-3 text-sm text-muted"><b className="text-ink">{c.modules}</b> modules · <b className="text-ink">{c.lessons}</b> lessons · {library ? 'library course' : <>used by <b className="text-ink">{c.cohorts}</b> {c.cohorts === 1 ? 'cohort' : 'cohorts'}</>}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
