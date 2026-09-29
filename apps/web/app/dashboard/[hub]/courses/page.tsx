import Link from 'next/link';
import { withUser } from '@talentral/db';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { NewCourseForm } from './forms';

export const metadata = { title: 'Courses' };

export default async function Courses({ params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const { courses, programmes } = await withUser(user.id, async (tx) => ({
    courses: await tx<{ id: string; title: string; status: 'draft' | 'published'; programme: string | null; modules: number; lessons: number; cohorts: number }[]>`
      select c.id, c.title, c.status, p.title as programme,
        (select count(*)::int from public.course_modules m where m.course_id = c.id) as modules,
        (select count(*)::int from public.lessons l where l.course_id = c.id) as lessons,
        (select count(*)::int from public.cohorts co where co.course_id = c.id) as cohorts
      from public.courses c left join public.programmes p on p.id = c.programme_id
      where c.tenant_id = ${hub.id} order by c.updated_at desc`,
    programmes: await tx<{ id: string; title: string }[]>`select id, title from public.programmes where tenant_id = ${hub.id} order by created_at desc`,
  }));
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader label="Learning" title="Courses" description="Build courses from modules and lessons: reading, video, audio, PDF, quizzes and assignments, in English and Hausa. Cohorts follow a course, and quizzes and assignments land in the gradebook." />
      <Card className="p-5 sm:p-6"><h2 className="mb-4 text-lg font-semibold">New course</h2><NewCourseForm slug={slug} programmes={programmes} /></Card>
      {courses.length === 0 ? <EmptyState title="No courses yet">Create your first course above. It starts with one module, ready for lessons.</EmptyState> : (
        <div className="grid gap-3 md:grid-cols-2">
          {courses.map((c) => (
            <Link key={c.id} href={`/dashboard/${slug}/courses/${c.id}`}>
              <Card className="h-full p-5 transition hover:border-blue/40 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-lg font-semibold">{c.title}</p>
                  <Badge tone={c.status === 'published' ? 'teal' : 'violet'}>{c.status === 'published' ? 'Published' : 'Draft'}</Badge>
                </div>
                {c.programme && <p className="text-sm text-muted">{c.programme}</p>}
                <p className="mt-3 text-sm text-muted"><b className="text-ink">{c.modules}</b> modules · <b className="text-ink">{c.lessons}</b> lessons · used by <b className="text-ink">{c.cohorts}</b> {c.cohorts === 1 ? 'cohort' : 'cohorts'}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
