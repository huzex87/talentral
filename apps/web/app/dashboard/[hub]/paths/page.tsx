import { Route } from 'lucide-react';
import Link from 'next/link';
import { withUser } from '@talentral/db';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { NewPathForm } from './forms';

export const metadata = { title: 'Learning paths' };

type Row = { id: string; title: string; outcome: string | null; status: 'draft' | 'published'; sequential: boolean; courses: string[]; cohorts: number };

export default async function Paths({ params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const paths = await withUser(user.id, (tx) => tx<Row[]>`
    select p.id, p.title, p.outcome, p.status, p.sequential,
      coalesce((select array_agg(c.title order by pc.position, c.created_at) from public.learning_path_courses pc join public.courses c on c.id = pc.course_id where pc.path_id = p.id), '{}') as courses,
      (select count(*)::int from public.cohorts co where co.path_id = p.id) as cohorts
    from public.learning_paths p where p.tenant_id = ${hub.id} order by p.updated_at desc`);
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader label="Learning" title="Learning paths"
        description="Put courses in order to build a career pathway, such as HTML and CSS, then JavaScript, then React. A cohort can follow a path instead of a single course; published paths also show on your hub page." />
      <Card className="p-5 sm:p-6"><h2 className="mb-4 text-lg font-semibold">New learning path</h2><NewPathForm slug={slug} /></Card>
      {paths.length === 0 ? <EmptyState icon={Route} title="No learning paths yet">Create a path above, then add your courses in the order learners should take them.</EmptyState> : (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Learning paths">
          {paths.map((p) => (
            <li key={p.id}>
              <Link href={`/dashboard/${slug}/paths/${p.id}`} className="block h-full">
                <Card className="h-full p-5 transition hover:border-blue/40 hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-lg font-semibold">{p.title}</p>
                    <Badge tone={p.status === 'published' ? 'teal' : 'violet'}>{p.status === 'published' ? 'Published' : 'Draft'}</Badge>
                  </div>
                  {p.outcome && <p className="text-sm text-muted">Leads to: {p.outcome}</p>}
                  <p className="mt-3 text-sm">{p.courses.length ? p.courses.join(' → ') : <span className="text-muted">No courses yet</span>}</p>
                  <p className="mt-2 text-sm text-muted">{p.sequential ? 'One course at a time' : 'All courses open together'} · used by <b className="text-ink">{p.cohorts}</b> {p.cohorts === 1 ? 'cohort' : 'cohorts'}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
