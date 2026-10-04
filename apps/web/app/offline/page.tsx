import { TalentralLogo } from '@/components/logo';
import { SavedCourses } from './saved-courses';
import { WifiOff } from 'lucide-react';

export const metadata = { title: 'Offline' };
export const dynamic = 'force-static';

// Shown by the offline worker when a page is not saved on the phone. It is the same for everyone,
// so it carries both languages; the list of saved courses is read from the phone.
export default function Offline() {
  return (
    <main id="main" tabIndex={-1} className="flex min-h-dvh flex-col bg-canvas">
      <div className="brand-rule" />
      <div className="mx-auto w-full max-w-lg flex-1 px-4 py-12">
        <div className="mb-8 flex justify-center"><TalentralLogo height={28} /></div>
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-6 text-center shadow-[var(--shadow-card)] sm:p-8">
          <span aria-hidden className="mx-auto flex size-14 items-center justify-center rounded-full border border-amber-800/15 bg-amber-50 text-amber-800"><WifiOff className="size-6" strokeWidth={1.75} /></span>
          <h1 className="mt-4 text-2xl font-semibold">You are offline</h1>
          <p className="mt-1 text-lg font-semibold text-muted" lang="ha">Ba ka kan intanet</p>
          <p className="mt-3 text-[15px] text-muted">This page is not saved on your phone. Lessons you downloaded still open below.</p>
          <p className="mt-1 text-[15px] text-muted" lang="ha">Ba a ajiye wannan shafin a wayarka ba. Darussan da ka sauke suna nan a ƙasa.</p>
        </div>
        <SavedCourses />
      </div>
    </main>
  );
}
