// Learner-level M&E export, as Excel or CSV, optionally anonymised. Each export is audited.
import { withUser } from '@talentral/db';
import { requireHubRole } from '@/lib/auth';
import { exportTable, loadImpact } from '@/lib/impact-data';
import { writeCsv, writeXlsx } from '@/lib/xlsx-write';

export async function GET(req: Request, { params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const q = new URL(req.url).searchParams;
  const format = q.get('format') === 'csv' ? 'csv' : 'xlsx';
  const anonymise = q.get('anonymise') === '1';
  const filters = { programme: q.get('programme') ?? undefined, cohort: q.get('cohort') ?? undefined };
  const { header, body, count } = await withUser(user.id, async (tx) => {
    const { learners, filters: f } = await loadImpact(tx, hub.id, filters);
    const table = exportTable(learners, anonymise);
    await tx`select app.audit(${hub.id}, 'impact.exported', 'tenant', ${hub.id}, ${tx.json({ format, anonymise, rows: learners.length, programme: f.programme, cohort: f.cohort })})`;
    return { ...table, count: learners.length };
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `${hub.slug}-learners-${anonymise ? 'anonymised-' : ''}${stamp}.${format}`;
  const headers = { 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store', 'X-Row-Count': String(count) };
  return format === 'csv'
    ? new Response(writeCsv(header, body), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8' } })
    : new Response(Buffer.from(writeXlsx('Learners', header, body)), { headers: { ...headers, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
}
