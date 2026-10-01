import Link from 'next/link';
import { withUser } from '@talentral/db';
import { OutcomesView } from '@/components/outcomes-view';
import { TopBar } from '@/components/top-bar';
import { PageHeader } from '@/components/ui';
import { requirePlatformAdmin } from '@/lib/auth';
import { loadOutcomes } from '@/lib/outcomes-data';

export const metadata = { title: 'Pilot outcomes' };

export default async function PlatformOutcomes() {
  const user = await requirePlatformAdmin();
  const report = await withUser(user.id, (tx) => loadOutcomes(tx, null));
  return (
    <div className="min-h-dvh">
      <TopBar user={user} />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader label="Talentral platform" title="Pilot outcomes"
          description="How the pilot measures against Gate G3 across every active hub: learners completing, completers with their readiness assessed, employers engaged, and the first placements, with employer confirmation and the 90-day check."
          actions={<Link href="/platform/talent/placements" className="text-sm font-semibold text-blue hover:underline">Placements →</Link>} />
        <OutcomesView report={report} scope="platform" />
      </main>
    </div>
  );
}
