// Placeholder blocks shown while a page loads, so slow connections get instant feedback. The pulse
// only runs for people who have not asked their device to reduce motion.
import { cx } from './ui';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx('rounded-lg bg-line/60 motion-safe:animate-pulse', className)} />;
}

// A page header, a row of figures and a few cards: close to most dashboard pages.
export function PageSkeleton({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">{label}…</span>
      <div className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-8 w-64 max-w-full" /><Skeleton className="h-4 w-96 max-w-full" /></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
    </div>
  );
}
