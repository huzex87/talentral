import { withUser } from '@talentral/db';
import { OutcomesView } from '@/components/outcomes-view';
import { PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { loadOutcomes } from '@/lib/outcomes-data';

export const metadata = { title: 'Pilot outcomes' };

export default async function HubOutcomes({ params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const report = await withUser(user.id, (tx) => loadOutcomes(tx, hub.id));
  return (
    <div>
      <PageHeader label={hub.name} title="Pilot outcomes"
        description="Are your learners completing, is their readiness assessed, and are they finding work? Measured against the pilot’s Gate G3 targets. Placements show as counts; employers stay private to the Talentral talent team." />
      <OutcomesView report={report} scope="hub" />
    </div>
  );
}
