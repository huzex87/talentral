import Link from 'next/link';
import { REFERENCE_PATTERN } from '@talentral/domain';
import { Card } from '@/components/ui';
import { hubPath } from '@/lib/urls';
import { ClearSentDraft } from '../form-progress';

type Props = { params: Promise<{ hub: string; programme: string }>; searchParams: Promise<{ ref?: string }> };

export const metadata = { title: 'Application received' };

export default async function Submitted({ params, searchParams }: Props) {
  const { hub } = await params;
  const { ref } = await searchParams;
  const reference = ref && REFERENCE_PATTERN.test(ref) ? ref : null;
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <ClearSentDraft />
      <Card className="p-7 text-center sm:p-10">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-teal-50 text-teal-700">
          <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <h1 className="mt-5 text-2xl font-semibold">Application received</h1>
        <p className="mt-2 text-muted">Thank you. We have emailed you a confirmation.</p>
        {reference && (
          <div className="mt-6 rounded-[var(--radius-control)] border border-line bg-canvas px-4 py-3">
            <p className="text-[13px] font-medium text-muted">Your reference number</p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-wider" data-testid="reference">{reference}</p>
          </div>
        )}
        <p className="mt-6 text-sm text-muted">Keep your reference number for any questions about your application.</p>
        <Link href={hubPath(hub)} className="mt-6 inline-block text-sm font-semibold text-[var(--hub)] hover:underline">Back to all programmes</Link>
      </Card>
    </div>
  );
}
