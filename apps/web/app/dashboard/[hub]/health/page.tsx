import { withUser } from '@talentral/db';
import { HealthView } from '@/components/health-view';
import { PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { loadHealth } from '@/lib/health-data';

export const metadata = { title: 'Engagement' };

export default async function HubHealth({ params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const report = await withUser(user.id, (tx) => loadHealth(tx, hub.id));
  return (
    <div>
      <PageHeader label={hub.name} title="Engagement"
        description="Are learners starting, coming back and attending, and would they and your team recommend Talentral? Measured against the pilot’s Gate G2 targets." />
      <HealthView report={report} scope="hub" />
    </div>
  );
}
