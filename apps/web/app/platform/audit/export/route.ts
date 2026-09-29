// The platform-wide audit log as CSV (up to 10,000 rows).
import { withUser } from '@talentral/db';
import { requirePlatformAdmin } from '@/lib/auth';
import { auditEvents, readFilter } from '@/lib/audit-data';
import { auditCsv } from '@/lib/audit-export';

export async function GET(req: Request) {
  const user = await requirePlatformAdmin();
  const filter = readFilter(Object.fromEntries(new URL(req.url).searchParams));
  const rows = await withUser(user.id, (tx) => auditEvents(tx, null, { ...filter, before: undefined }, 10_000));
  return new Response(auditCsv(rows), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="talentral-audit-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' },
  });
}
