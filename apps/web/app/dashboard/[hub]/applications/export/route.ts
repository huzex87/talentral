// CSV export of the filtered applications, one column per question. Every export is audited.
import { withUser, type Programme } from '@talentral/db';
import type { FormField } from '@talentral/domain';
import { STATUS_LABELS, type ApplicationStatus } from '@talentral/domain';
import { hubAccess } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { readFilters, whereClause } from '../query';

const cell = (v: unknown) => {
  let s = v == null ? '' : Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? String((v as { name?: string }).name ?? '') : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
  return `"${s.replace(/"/g, '""')}"`;
};

export async function GET(req: Request, { params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const { user, hub } = await hubAccess(slug);
  const f = readFilters(Object.fromEntries(new URL(req.url).searchParams));
  const { rows, programmes } = await withUser(user.id, async (tx) => {
    const rows = await tx<{ reference: string; full_name: string; email: string; phone: string; track: string | null; status: string; submitted_at: Date; answers: Record<string, unknown>; programme_id: string }[]>`
      select a.reference, a.full_name, a.email, a.phone, a.track, a.status, a.submitted_at, a.answers, a.programme_id
      from public.applications a where ${whereClause(tx, hub.id, f)} order by a.submitted_at`;
    const programmes = await tx<Pick<Programme, 'id' | 'title' | 'form'>[]>`select id, title, form from public.programmes where tenant_id = ${hub.id}`;
    await tx`select app.audit(${hub.id}, 'applications.exported', 'tenant', ${hub.id}, ${tx.json({ rows: rows.length, filters: f as never })})`;
    return { rows, programmes };
  });
  const byId = new Map(programmes.map((p) => [p.id, p]));
  const questions = new Map<string, string>();
  for (const p of programmes) if (!f.programme || p.id === f.programme) for (const q of p.form as FormField[]) if (!questions.has(q.id)) questions.set(q.id, q.label);
  const header = ['Reference', 'Programme', 'Full name', 'Email', 'Phone', 'Track', 'Status', 'Submitted (WAT)', ...questions.values()];
  const lines = [header.map(cell).join(',')];
  for (const r of rows) {
    lines.push([r.reference, byId.get(r.programme_id)?.title, r.full_name, r.email, r.phone, r.track, STATUS_LABELS[r.status as ApplicationStatus] ?? r.status,
      formatDate(r.submitted_at, true), ...[...questions.keys()].map((k) => r.answers[k])].map(cell).join(','));
  }
  const name = `${hub.slug}-applications-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(`﻿${lines.join('\r\n')}\r\n`, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
  });
}
