import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { ThreadView } from '@/components/discussion';
import { canManage, hubAccess } from '@/lib/auth';
import { threadWithPosts } from '@/lib/discussion-data';

export const metadata = { title: 'Discussion' };

export default async function HubThread({ params }: { params: Promise<{ hub: string; id: string; thread: string }> }) {
  const { hub: slug, id, thread } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(thread)) notFound();
  const { user, hub, role } = await hubAccess(slug);
  const data = await withUser(user.id, async (tx) => {
    const [cohort] = await tx`select 1 from public.cohorts where id = ${id} and tenant_id = ${hub.id}`;
    return cohort ? threadWithPosts(tx, id, thread) : null;
  });
  if (!data) notFound();
  return (
    <div className="max-w-3xl">
      <ThreadView thread={data.thread} posts={data.posts} back={`/dashboard/${slug}/cohorts/${id}/discussion`} lang="en" moderator={canManage(role)} />
    </div>
  );
}
