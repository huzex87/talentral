'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { BULK_TARGETS, STATUS_LABELS, isNotifiedStatus } from '@talentral/domain';
import { StatusBadge } from '@/components/status-badge';
import { ScorePill } from '@/components/score-pill';
import { Alert, Button, Card, Select, cx } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { bulkMove, type BulkResult, type Selection } from './actions';

export interface Row {
  id: string; reference: string; full_name: string; email: string; track: string | null; status: string;
  submitted_at: Date; state: string | null; gender: string | null; score: string | null; reviews: number; source: 'applied' | 'imported';
}

// The applications table with row selection and a bulk action bar. "Select all matching" hands the
// current filters to the server, so it covers every page, not only the rows on screen.
export function ApplicationsTable({ slug, rows, total, filters, showScore }: { slug: string; rows: Row[]; total: number; filters: string; showScore: boolean }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [to, setTo] = useState<string>('');
  const [notify, setNotify] = useState(true);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [pending, start] = useTransition();

  const pageAll = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const count = allMatching ? total : picked.size;
  const toggle = (id: string) => { setAllMatching(false); setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const togglePage = () => { setAllMatching(false); setPicked(pageAll ? new Set() : new Set(rows.map((r) => r.id))); };
  const clear = () => { setPicked(new Set()); setAllMatching(false); };

  const apply = () => start(async () => {
    const selection: Selection = allMatching ? { filters } : { ids: [...picked] };
    const r = await bulkMove(slug, selection, to, notify && isNotifiedStatus(to));
    setResult(r);
    if (r.ok) clear();
  });

  return (
    <div className="space-y-3">
      {result && <Alert tone={result.ok ? 'teal' : 'amber'}>{result.message}</Alert>}

      {count > 0 && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-blue/30 bg-blue-50/95 px-4 py-3 shadow-sm backdrop-blur">
          <span className="text-sm font-semibold">{count} selected</span>
          {pageAll && !allMatching && total > rows.length && (
            <button type="button" className="text-sm font-semibold text-blue hover:underline" onClick={() => setAllMatching(true)}>Select all {total} matching</button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Move selected to" className="h-9 w-auto py-0 text-sm">
              <option value="">Move to…</option>
              {BULK_TARGETS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </Select>
            {isNotifiedStatus(to) && (
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 accent-blue" /> Email applicants</label>
            )}
            <Button size="sm" disabled={!to || pending} onClick={apply}>{pending ? 'Applying…' : `Apply to ${count}`}</Button>
            <Button size="sm" variant="ghost" onClick={clear} disabled={pending}>Clear</Button>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-line bg-canvas/70 text-xs text-muted font-medium">
              <tr>
                <th className="w-10 px-4 py-3"><input type="checkbox" checked={pageAll} onChange={togglePage} aria-label="Select all on this page" className="size-4 accent-blue" /></th>
                <th className="px-4 py-3">Applicant</th>
                {showScore && <th className="px-4 py-3">Score</th>}
                <th className="px-4 py-3">Track</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const on = allMatching || picked.has(r.id);
                return (
                  <tr key={r.id} className={cx('hover:bg-canvas/60', on && 'bg-blue-50/50')}>
                    <td className="px-4 py-3"><input type="checkbox" checked={on} onChange={() => toggle(r.id)} aria-label={`Select ${r.full_name}`} className="size-4 accent-blue" /></td>
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/${slug}/applications/${r.id}`} className="font-semibold text-ink hover:text-blue">{r.full_name}</Link>
                      {r.source === 'imported' && <span className="ml-2 rounded-md bg-violet-50 px-1.5 py-px text-[11px] font-medium text-violet">Imported</span>}
                      <p className="text-muted">{r.email} · <span className="font-mono text-[12px]">{r.reference}</span></p>
                    </td>
                    {showScore && (
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ScorePill percent={r.score === null ? null : Number(r.score)} />
                        {r.reviews > 0 && <span className="ml-1.5 text-xs text-muted">{r.reviews} {r.reviews === 1 ? 'review' : 'reviews'}</span>}
                      </td>
                    )}
                    <td className="px-4 py-3">{r.track ?? '–'}</td>
                    <td className="px-4 py-3">{r.state ?? '–'}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(r.submitted_at, true)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
