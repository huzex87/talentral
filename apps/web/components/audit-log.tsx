// The audit log table with its filters, shared by hub dashboards and the platform console.
import Link from 'next/link';
import { AUDIT_GROUPS, auditDetails, auditGroup, describeAudit } from '@talentral/domain';
import type { AuditFilter, AuditRow } from '@/lib/audit-data';
import { auditQuery } from '@/lib/audit-data';
import { Card, EmptyState, LinkButton, Select, cx } from './ui';

const TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const GROUP_TONE: Record<string, string> = {
  account: 'bg-violet-50 text-violet', member: 'bg-violet-50 text-violet', hub: 'bg-violet-50 text-violet',
  certificate: 'bg-teal-50 text-teal-700', file: 'bg-amber-50 text-amber-800', discussion: 'bg-danger-50 text-danger',
};

export function AuditLog({ rows, filter, actors, base, showHub, pageSize }: {
  rows: AuditRow[]; filter: AuditFilter; actors: { id: string; name: string }[]; base: string; showHub: boolean; pageSize: number;
}) {
  const last = rows.at(-1);
  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto] lg:items-end">
          <label className="text-sm font-semibold">What
            <Select name="group" defaultValue={filter.group ?? ''} className="mt-1.5">
              <option value="">Everything</option>
              {Object.entries(AUDIT_GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </label>
          <label className="text-sm font-semibold">Who
            <Select name="actor" defaultValue={filter.actor ?? ''} className="mt-1.5">
              <option value="">Anyone</option>
              {actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </label>
          <label className="text-sm font-semibold">From<input type="date" name="from" defaultValue={filter.from} className="mt-1.5 block h-11 w-full rounded-[var(--radius-control)] border border-line bg-white px-3" /></label>
          <label className="text-sm font-semibold">To<input type="date" name="to" defaultValue={filter.to} className="mt-1.5 block h-11 w-full rounded-[var(--radius-control)] border border-line bg-white px-3" /></label>
          <div className="flex gap-2">
            <button className="h-11 rounded-[var(--radius-control)] bg-blue px-4 font-semibold text-white hover:bg-blue-600">Filter</button>
            <a href={`${base}/export${auditQuery(filter)}`} className="inline-flex h-11 items-center rounded-[var(--radius-control)] border border-blue/60 px-4 font-semibold text-blue hover:bg-blue-50">CSV</a>
          </div>
        </form>
      </Card>

      {rows.length === 0 ? <EmptyState title="Nothing recorded">No events match these filters.</EmptyState> : (
        <Card className="overflow-hidden">
          <ol className="divide-y divide-line" aria-label="Audit log">
            {rows.map((r) => {
              const g = auditGroup(r.action);
              const details = auditDetails(r.metadata);
              return (
                <li key={r.id} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-4">
                  <time className="text-xs font-semibold tabular-nums text-muted sm:pt-0.5" dateTime={new Date(r.at).toISOString()}>{TIME.format(new Date(r.at))}</time>
                  <div className="min-w-0">
                    <p className="text-[15px]">
                      <b>{r.actor ?? 'System'}</b> <span>{describeAudit(r.action).replace(/^./, (c) => c.toLowerCase())}</span>
                      <span className={cx('ml-2 inline-block rounded-full px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide', GROUP_TONE[g] ?? 'bg-canvas text-muted')}>{AUDIT_GROUPS[g] ?? 'Other'}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">{[showHub && (r.hub ?? 'Platform'), details, r.target_type !== 'user' && r.target_id ? `${r.target_type} ${r.target_id.slice(0, 8)}` : null].filter(Boolean).join(' · ')}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
      <div className="flex justify-between">
        {filter.before ? <Link href={`${base}${auditQuery(filter)}`} className="text-sm font-semibold text-blue hover:underline">← Newest</Link> : <span />}
        {rows.length === pageSize && last && <LinkButton variant="secondary" size="sm" href={`${base}${auditQuery(filter, { before: last.id })}`}>Older →</LinkButton>}
      </div>
    </div>
  );
}
