import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { ThreadView } from '@/components/discussion';
import { LearnerShell } from '@/components/learner-shell';
import { requireUser } from '@/lib/auth';
import { discussionRole, threadWithPosts } from '@/lib/discussion-data';

export const metadata = { title: 'Discussion' };

export default async function LearnerThread({ params }: { params: Promise<{ cohort: string; thread: string }> }) {
  const { cohort, thread } = await params;
  if (!/^[0-9a-f-]{36}$/.test(cohort) || !/^[0-9a-f-]{36}$/.test(thread)) notFound();
  const user = await requireUser();
  const data = await withUser(user.id, async (tx) => ((await discussionRole(tx, cohort)) === 'learner' ? threadWithPosts(tx, cohort, thread) : null));
  if (!data) notFound();
  return (
    <LearnerShell user={user} language={user.language} active="learn">
      <div className="mx-auto max-w-3xl">
        <ThreadView thread={data.thread} posts={data.posts} back={`/learn/${cohort}/discussion`} lang={user.language} moderator={false} />
      </div>
    </LearnerShell>
  );
}
