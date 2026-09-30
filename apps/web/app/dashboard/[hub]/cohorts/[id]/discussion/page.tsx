import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { ThreadList } from '@/components/discussion';
import { PageHeader } from '@/components/ui';
import { hubAccess } from '@/lib/auth';
import { cohortThreads } from '@/lib/discussion-data';

export const metadata = { title: 'Discussion' };

export default async function HubDiscussion({ params }: { params: Promise<{ hub: string; id: string }> }) {
  const { hub: slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user, hub } = await hubAccess(slug);
  const data = await withUser(user.id, async (tx) => {
    const [cohort] = await tx<{ name: string }[]>`select name from public.cohorts where id = ${id} and tenant_id = ${hub.id}`;
    return cohort ? { cohort, threads: await cohortThreads(tx, id) } : null;
  });
  if (!data) notFound();
  const open = data.threads.filter((t) => !t.hidden);
  const unanswered = open.filter((t) => t.replies === 0 && !t.author_is_team).length;
  return (
    <div className="max-w-4xl">
      <Link href={`/dashboard/${slug}/cohorts/${id}`} className="text-sm font-semibold text-violet hover:underline">← {data.cohort.name}</Link>
      <PageHeader label="Cohort" title="Discussion" description={`${open.length} discussion${open.length === 1 ? '' : 's'}${unanswered ? ` · ${unanswered} waiting for a first reply` : ''}. Learners see posts from the team marked “Hub team”. Owners and admins can pin, close and hide.`} />
      <ThreadList cohortId={id} threads={data.threads} base={`/dashboard/${slug}/cohorts/${id}/discussion`} lang="en" />
    </div>
  );
}
