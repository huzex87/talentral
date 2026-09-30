import Link from 'next/link';
import { withUser } from '@talentral/db';
import { AuditLog } from '@/components/audit-log';
import { TopBar } from '@/components/top-bar';
import { PageHeader } from '@/components/ui';
import { requirePlatformAdmin } from '@/lib/auth';
import { auditActors, auditEvents, readFilter } from '@/lib/audit-data';

export const metadata = { title: 'Audit log' };
const PAGE = 100;

export default async function PlatformAudit({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePlatformAdmin();
  const filter = readFilter(await searchParams);
  const { rows, actors } = await withUser(user.id, async (tx) => ({ rows: await auditEvents(tx, null, filter, PAGE), actors: await auditActors(tx, null) }));
  return (
    <div className="min-h-dvh">
      <TopBar user={user} />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link href="/platform" className="text-sm font-semibold text-violet hover:underline">← Platform</Link>
        <PageHeader label="Platform" title="Audit log" description="Events across every hub, plus account security events such as two-step sign-in changes and personal data downloads." />
        <AuditLog rows={rows} filter={filter} actors={actors} base="/platform/audit" showHub pageSize={PAGE} />
      </main>
    </div>
  );
}
