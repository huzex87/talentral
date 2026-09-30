import { TalentralLogo } from '@/components/logo';
import { Skeleton } from '@/components/skeleton';

// Learners are often on slow connections: show the page's shape at once.
export default function Loading() {
  return (
    <div className="min-h-dvh">
      <div className="brand-rule" />
      <div className="border-b border-line bg-white"><div className="mx-auto flex h-14 max-w-3xl items-center px-4"><TalentralLogo height={24} href={null} /></div></div>
      <div role="status" aria-live="polite" className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <span className="sr-only">Loading… Ana lodawa…</span>
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-28" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    </div>
  );
}
