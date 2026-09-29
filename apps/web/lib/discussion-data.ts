import 'server-only';
import type { Tx } from '@talentral/db';

export interface Thread {
  id: string; title: string; body: string; author: string; author_is_team: boolean; mine: boolean;
  pinned: boolean; locked: boolean; hidden: boolean; replies: number; last_activity_at: Date; created_at: Date;
}
export interface Post { id: string; body: string; author: string; author_is_team: boolean; mine: boolean; hidden: boolean; created_at: Date }

export async function discussionRole(tx: Tx, cohortId: string): Promise<'team' | 'learner' | null> {
  const [r] = await tx<{ role: 'team' | 'learner' | null }[]>`select app.discussion_role(${cohortId}) as role`;
  return r?.role ?? null;
}

export async function cohortThreads(tx: Tx, cohortId: string): Promise<Thread[]> {
  return tx<Thread[]>`select * from app.cohort_threads(${cohortId})`;
}

export async function threadWithPosts(tx: Tx, cohortId: string, threadId: string): Promise<{ thread: Thread; posts: Post[] } | null> {
  const thread = (await cohortThreads(tx, cohortId)).find((t) => t.id === threadId);
  if (!thread) return null;
  return { thread, posts: await tx<Post[]>`select * from app.thread_posts(${threadId})` };
}
