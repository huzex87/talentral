import Link from 'next/link';
import { withUser, type Programme } from '@talentral/db';
import { APPLICATION_STATUSES, STATUS_LABELS } from '@talentral/domain';
import { StatusBadge } from '@/components/status-badge';
import { Card, EmptyState, LinkButton, PageHeader, Select, Input, Button } from '@/components/ui';
import { hubAccess } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { readFilters, whereClause } from './query';

export const metadata = { title: 'Applications' };
const PAGE = 50;

type Row = { id: string; reference: string; full_name: string; email: string; phone: string; track: string | null; status: string; submitted_at: Date; state: string | null; gender: string | null; programme: string };

export default async function Applications({ params, searchParams }: { params: Promise<{ hub: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { hub: slug } = await params;
  const sp = await searchParams;
  const f = readFilters(sp);
  const { user, hub } = await hubAccess(slug);
  const { rows, total, programmes } = await withUser(user.id, async (tx) => {
    const where = whereClause(tx, hub.id, f);
    const [count] = await tx<{ n: number }[]>`select count(*)::int as n from public.applications a where ${where}`;
    const rows = await tx<Row[]>`
      select a.id, a.reference, a.full_name, a.email, a.phone, a.track, a.status, a.submitted_at,
        a.answers ->> 'state_of_residence' as state, a.answers ->> 'gender' as gender, p.title as programme
      from public.applications a join public.programmes p on p.id = a.programme_id
      where ${where} order by a.submitted_at desc limit ${PAGE} offset ${(f.page! - 1) * PAGE}`;
    const programmes = await tx<Pick<Programme, 'id' | 'title' | 'tracks'>[]>`select id, title, tracks from public.programmes where tenant_id = ${hub.id} order by created_at desc`;
    return { rows, total: count?.n ?? 0, programmes };
  });
  const tracks = [...new Set(programmes.filter((p) => !f.programme || p.id === f.programme).flatMap((p) => p.tracks))];
  const qs = (extra: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ programme: f.programme, status: f.status, track: f.track, q: f.q, ...extra })) if (v) u.set(k, String(v));
    return u.toString();
  };
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div>
      <PageHeader label="Review" title="Applications" description={`${total} ${total === 1 ? 'application' : 'applications'}${f.status || f.programme || f.track || f.q ? ' match your filters' : ''}.`}
        actions={<LinkButton variant="secondary" href={`/dashboard/${slug}/applications/export?${qs({ page: undefined })}`}>Download CSV</LinkButton>} />

      <Card className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
          <Input name="q" defaultValue={f.q} placeholder="Search name, email, phone or reference" aria-label="Search" />
          <Select name="programme" defaultValue={f.programme ?? ''} aria-label="Programme"><option value="">All programmes</option>{programmes.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>
          <Select name="status" defaultValue={f.status ?? ''} aria-label="Status"><option value="">All statuses</option>{APPLICATION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</Select>
          <Select name="track" defaultValue={f.track ?? ''} aria-label="Track"><option value="">All tracks</option>{tracks.map((t) => <option key={t}>{t}</option>)}</Select>
          <Button variant="secondary" type="submit">Filter</Button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="No applications yet">When people apply, they appear here. Share your programme link to start receiving applications.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line bg-canvas text-xs uppercase tracking-[0.08em] text-muted">
                <tr><th className="px-4 py-3">Applicant</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Track</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Submitted</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-canvas/60">
                    <td className="px-4 py-3"><Link href={`/dashboard/${slug}/applications/${r.id}`} className="font-semibold text-ink hover:text-blue">{r.full_name}</Link><p className="text-muted">{r.email}</p></td>
                    <td className="px-4 py-3 font-mono text-[13px]">{r.reference}</td>
                    <td className="px-4 py-3">{r.track ?? '–'}</td>
                    <td className="px-4 py-3">{r.state ?? '–'}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(r.submitted_at, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
              <span className="text-muted">Page {f.page} of {pages}</span>
              <div className="flex gap-2">
                {f.page! > 1 && <LinkButton size="sm" variant="ghost" href={`?${qs({ page: f.page! - 1 })}`}>Previous</LinkButton>}
                {f.page! < pages && <LinkButton size="sm" variant="ghost" href={`?${qs({ page: f.page! + 1 })}`}>Next</LinkButton>}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
