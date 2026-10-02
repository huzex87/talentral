import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { Alert, Badge, Card, PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { movePathCourse, removePathCourse } from '../actions';
import { AddCourseForm, PathDetailsForm, PublishPathButton } from '../forms';

export const metadata = { title: 'Learning path' };

type Path = { id: string; title: string; title_ha: string | null; summary: string | null; summary_ha: string | null; outcome: string | null; status: 'draft' | 'published'; sequential: boolean };
type Step = { course_id: string; title: string; status: string; lessons: number; minutes: number };

export default async function PathPage({ params, searchParams }: { params: Promise<{ hub: string; id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { hub: slug, id } = await params;
  const { created } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const data = await withUser(user.id, async (tx) => {
    const [path] = await tx<Path[]>`select * from public.learning_paths where id = ${id} and tenant_id = ${hub.id}`;
    if (!path) return null;
    const steps = await tx<Step[]>`
      select c.id as course_id, c.title, c.status,
        (select count(*)::int from public.lessons l where l.course_id = c.id) as lessons,
        (select coalesce(sum(l.minutes), 0)::int from public.lessons l where l.course_id = c.id) as minutes
      from public.learning_path_courses pc join public.courses c on c.id = pc.course_id where pc.path_id = ${id} order by pc.position, c.created_at`;
    const available = await tx<{ id: string; title: string; status: string }[]>`
      select id, title, status from public.courses where tenant_id = ${hub.id} and id not in (select course_id from public.learning_path_courses where path_id = ${id}) order by title`;
    const cohorts = await tx<{ id: string; name: string }[]>`select id, name from public.cohorts where path_id = ${id} order by created_at`;
    return { path, steps, available, cohorts };
  });
  if (!data) notFound();
  const { path, steps, available, cohorts } = data;
  const lessons = steps.reduce((s, c) => s + c.lessons, 0);
  const minutes = steps.reduce((s, c) => s + c.minutes, 0);
  const drafts = steps.filter((s) => s.status !== 'published');

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader label={<Link href={`/dashboard/${slug}/paths`} className="hover:underline">← Learning paths</Link>} title={path.title}
        description={`${steps.length} ${steps.length === 1 ? 'course' : 'courses'} · ${lessons} lessons${minutes ? ` · about ${Math.max(1, Math.round(minutes / 60))} hours` : ''}`}
        actions={<><Badge tone={path.status === 'published' ? 'teal' : 'violet'}>{path.status === 'published' ? 'Published' : 'Draft'}</Badge><PublishPathButton slug={slug} pathId={path.id} status={path.status} /></>} />
      {created && <Alert tone="violet" title="Path created">Add your courses in the order learners should take them, then publish.</Alert>}
      {drafts.length > 0 && <Alert tone="amber" title="Some courses are drafts">Learners only see published courses: {drafts.map((d) => d.title).join(', ')}.</Alert>}

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Courses, in order</h2>
        <p className="mb-4 mt-1 text-sm text-muted">{path.sequential ? 'Each course opens once the learner finishes the one before.' : 'All courses open together.'}</p>
        {steps.length === 0 ? <p className="mb-4 text-sm text-muted">No courses yet.</p> : (
          <ol className="mb-5 space-y-2" aria-label="Courses in this path">
            {steps.map((s, i) => (
              <li key={s.course_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
                <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue text-sm font-bold text-white">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/dashboard/${slug}/courses/${s.course_id}`} className="font-semibold hover:text-blue">{s.title}</Link>
                  <p className="text-sm text-muted">{s.lessons} lessons{s.status !== 'published' ? ' · draft' : ''}</p>
                </div>
                <div className="flex items-center gap-1">
                  <form action={movePathCourse.bind(null, slug, path.id, s.course_id, -1)}><button disabled={i === 0} aria-label={`Move ${s.title} earlier`} className="rounded-lg px-2 py-1 text-muted hover:bg-canvas disabled:opacity-30">↑</button></form>
                  <form action={movePathCourse.bind(null, slug, path.id, s.course_id, 1)}><button disabled={i === steps.length - 1} aria-label={`Move ${s.title} later`} className="rounded-lg px-2 py-1 text-muted hover:bg-canvas disabled:opacity-30">↓</button></form>
                  <form action={removePathCourse.bind(null, slug, path.id, s.course_id)}><button aria-label={`Remove ${s.title} from the path`} className="rounded-lg px-2 py-1 text-sm font-semibold text-danger hover:bg-danger-50">Remove</button></form>
                </div>
              </li>
            ))}
          </ol>
        )}
        <AddCourseForm slug={slug} pathId={path.id} courses={available} />
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold">Details</h2>
        <PathDetailsForm slug={slug} pathId={path.id} p={path} />
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Cohorts following this path</h2>
        {cohorts.length === 0 ? <p className="mt-1 text-sm text-muted">None yet. Choose this path on a cohort’s page.</p> : (
          <ul className="mt-2 space-y-1 text-sm">{cohorts.map((c) => <li key={c.id}><Link href={`/dashboard/${slug}/cohorts/${c.id}`} className="font-semibold text-blue hover:underline">{c.name}</Link></li>)}</ul>
        )}
      </Card>
    </div>
  );
}
