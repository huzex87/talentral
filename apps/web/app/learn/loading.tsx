import { LearnerSkeleton } from '@/components/learner-skeleton';

// Learners are often on slow connections: show the app's frame and the page's shape at once.
export default function Loading() {
  return <LearnerSkeleton active="learn" />;
}
