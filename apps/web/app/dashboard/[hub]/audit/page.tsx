import { withUser } from '@talentral/db';
import { AuditLog } from '@/components/audit-log';
import { PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { auditActors, auditEvents, readFilter } from '@/lib/audit-data';

export const metadata = { title: 'Audit log' };
const PAGE = 100;

export default async function HubAudit({ params, searchParams }: { params: Promise<{ hub: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { hub: slug } = await params;
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const filter = readFilter(await searchParams);
  const { rows, actors } = await withUser(user.id, async (tx) => ({ rows: await auditEvents(tx, hub.id, filter, PAGE), actors: await auditActors(tx, hub.id) }));
  return (
    <div className="max-w-5xl">
      <PageHeader label="Settings" title="Audit log"
        description="Every important change at your hub, who made it and when: decisions, exports, file downloads, certificates, team changes and moderation. Entries cannot be edited or deleted." />
      <AuditLog rows={rows} filter={filter} actors={actors} base={`/dashboard/${slug}/audit`} showHub={false} pageSize={PAGE} />
    </div>
  );
}
