// The hub's audit log as CSV, with the same filters as the screen (up to 10,000 rows).
import { withUser } from '@talentral/db';
import { requireHubRole } from '@/lib/auth';
import { auditEvents, readFilter } from '@/lib/audit-data';
import { auditCsv } from '@/lib/audit-export';

export async function GET(req: Request, { params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const filter = readFilter(Object.fromEntries(new URL(req.url).searchParams));
  const rows = await withUser(user.id, (tx) => auditEvents(tx, hub.id, { ...filter, before: undefined }, 10_000));
  return new Response(auditCsv(rows), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${hub.slug}-audit-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' },
  });
}
