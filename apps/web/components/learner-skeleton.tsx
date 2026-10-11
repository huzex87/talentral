import { AppTabBar, type LearnerSection } from './app-tab-bar';
import { TalentralLogo } from './logo';
import { Skeleton } from './skeleton';
import { visitorLanguage } from '@/lib/i18n';

// The learner app's frame with the screen's shape inside, shown while a learner screen loads. The
// app bar and tab bar stay exactly where they will be, so a slow connection never flashes a
// different header: only the content fills in.
export async function LearnerSkeleton({ active }: { active: LearnerSection }) {
  const lang = await visitorLanguage();
  return (
    <div className="min-h-dvh pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0">
      <div className="app-chrome sticky top-0 z-30 border-b border-white/[0.08] bg-midnight pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <TalentralLogo dark height={22} href={null} />
          <span className="size-8 rounded-full bg-white/10" aria-hidden />
        </div>
      </div>
      <AppTabBar lang={lang} active={active} />
      <div role="status" aria-live="polite" className="mx-auto max-w-6xl space-y-4 px-4 pt-4 sm:px-6 md:pt-8">
        <span className="sr-only">{lang === 'ha' ? 'Ana lodawa…' : 'Loading…'}</span>
        <div className="space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-56" /></div>
        <Skeleton className="h-36" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    </div>
  );
}
