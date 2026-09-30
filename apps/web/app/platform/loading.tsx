import { TalentralLogo } from '@/components/logo';
import { PageSkeleton } from '@/components/skeleton';

export default function Loading() {
  return (
    <div className="min-h-dvh">
      <div className="brand-rule" />
      <div className="border-b border-line bg-white"><div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6"><TalentralLogo height={24} href={null} /></div></div>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><PageSkeleton /></div>
    </div>
  );
}
