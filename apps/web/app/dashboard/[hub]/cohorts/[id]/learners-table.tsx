'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { ENGAGEMENT_LABELS, STANDING_LABELS, type Engagement, type Standing } from '@talentral/domain';
import { Alert, Button, Card, Input, cx } from '@/components/ui';
import { setEnrolmentStatus } from '../actions';

export interface Learner {
  id: string; application_id: string; full_name: string; reference: string; track: string | null;
  status: 'active' | 'completed' | 'dropped'; rate: number | null; standing: Standing; source: 'applied' | 'imported';
  score: number | null; graded: number; total: number; certificate: string | null; certificate_revoked: boolean;
  lastActive: string | null; days: number; engagement: Engagement; nudged: 'learner' | 'team' | null;
}

const STANDING_TONE: Record<Standing, string> = {
  meets: 'bg-teal-50 text-teal-700', at_risk: 'bg-amber-50 text-amber-800', below: 'bg-danger-50 text-danger', no_sessions: 'bg-canvas text-muted',
};
const STATUS_TONE = { active: 'bg-blue-50 text-blue', completed: 'bg-violet-50 text-violet', dropped: 'bg-canvas text-muted' } as const;
const STATUS_LABEL = { active: 'Active', completed: 'Completed', dropped: 'Dropped out' } as const;
const ENGAGEMENT_DOT: Record<Engagement, string> = { active: 'bg-teal-700', quiet: 'bg-amber-800', inactive: 'bg-danger', never: 'bg-muted/40' };

function LastActive({ l }: { l: Learner }) {
  if (l.status !== 'active') return <span className="text-muted">–</span>;
  const when = !l.lastActive ? 'Not started' : l.days === 0 ? 'Today' : l.days === 1 ? 'Yesterday' : `${l.days} days ago`;
  return (
    <span className="block">
      <span className="flex items-center gap-1.5 whitespace-nowrap"><span className={cx('size-2 rounded-full', ENGAGEMENT_DOT[l.engagement])} aria-hidden />{when}</span>
      <span className="sr-only">{ENGAGEMENT_LABELS[l.engagement]}</span>
      {l.nudged && <span className="mt-0.5 block text-xs text-muted">{l.nudged === 'team' ? 'Nudged · team told' : 'Nudged'}</span>}
    </span>
  );
}

// Learners with their attendance and standing. Owners and admins select learners to confirm
// completion or record drop-outs; "select everyone who meets the bar" does the usual end-of-cohort step.
export function LearnersTable({ slug, cohortId, learners, manage, min, passMark }: { slug: string; cohortId: string; learners: Learner[]; manage: boolean; min: number; passMark: number | null }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<{ ok?: boolean; message?: string } | null>(null);
  const [pending, start] = useTransition();
  const eligible = learners.filter((l) => l.status === 'active' && l.standing === 'meets');
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const apply = (status: 'active' | 'completed' | 'dropped') => start(async () => {
    setResult(await setEnrolmentStatus(slug, cohortId, [...picked], status, reason));
    setPicked(new Set()); setReason('');
  });

  return (
    <div className="space-y-3">
      {result?.message && <Alert tone={result.ok ? 'teal' : 'danger'}>{result.message}</Alert>}
      {manage && (
        <div className={cx('flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3', picked.size ? 'sticky top-2 z-20 border-blue/30 bg-blue-50/95 backdrop-blur' : 'border-line bg-white')}>
          {picked.size === 0 ? (
            <>
              <span className="text-sm text-muted">{eligible.length} active {eligible.length === 1 ? 'learner meets' : 'learners meet'} the {min}% attendance bar{passMark !== null ? ` and the ${passMark}% pass mark` : ''}.</span>
              {eligible.length > 0 && <Button size="sm" variant="secondary" onClick={() => setPicked(new Set(eligible.map((l) => l.id)))}>Select everyone who meets the bar</Button>}
            </>
          ) : (
            <>
              <span className="text-sm font-semibold">{picked.size} selected</span>
              <Button size="sm" disabled={pending} onClick={() => apply('completed')}>Mark as completed</Button>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Reason for dropping out (optional)" aria-label="Reason for dropping out" className="h-9 w-auto min-w-52 text-sm" />
              <Button size="sm" variant="danger" disabled={pending} onClick={() => apply('dropped')}>Mark as dropped out</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => apply('active')}>Set back to active</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setPicked(new Set())}>Clear</Button>
            </>
          )}
        </div>
      )}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] sm:min-w-[680px] text-left text-sm">
            <thead className="border-b border-line bg-canvas text-xs uppercase tracking-[0.08em] text-muted">
              <tr>
                {manage && <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select all learners" className="size-4 accent-blue" checked={learners.length > 0 && picked.size === learners.length} onChange={() => setPicked(picked.size === learners.length ? new Set() : new Set(learners.map((l) => l.id)))} /></th>}
                <th className="px-4 py-3">Learner</th><th className="hidden px-4 py-3 sm:table-cell">Track</th><th className="px-4 py-3">Last active</th><th className="px-4 py-3">Attendance</th>{passMark !== null && <th className="px-4 py-3">Score</th>}<th className="px-4 py-3">Standing</th><th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {learners.map((l) => (
                <tr key={l.id} className={cx(picked.has(l.id) && 'bg-blue-50/50', l.status === 'dropped' && 'text-muted')}>
                  {manage && <td className="px-4 py-3"><input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Select ${l.full_name}`} className="size-4 accent-blue" /></td>}
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/${slug}/applications/${l.application_id}`} className="font-semibold hover:text-blue">{l.full_name}</Link>
                    <p className="text-[12px] text-muted"><span className="font-mono">{l.reference}</span>{l.source === 'imported' && ' · imported'}</p>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">{l.track ?? '–'}</td>
                  <td className="px-4 py-3 text-[13px]"><LastActive l={l} /></td>
                  <td className="px-4 py-3 font-semibold tabular-nums">{l.rate === null ? '–' : `${l.rate}%`}</td>
                  {passMark !== null && (
                    <td className="px-4 py-3 tabular-nums">
                      <span className="font-semibold">{l.score === null ? '–' : `${l.score}%`}</span>
                      {l.graded < l.total && <span className="block text-xs text-muted">{l.graded} of {l.total} graded</span>}
                    </td>
                  )}
                  <td className="px-4 py-3"><span className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold', STANDING_TONE[l.standing])}>{STANDING_LABELS[l.standing]}</span></td>
                  <td className="px-4 py-3">
                    <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_TONE[l.status])}>{STATUS_LABEL[l.status]}</span>
                    {l.certificate && (
                      <Link href={`/verify/${l.certificate}`} target="_blank" className={cx('mt-1 block text-xs font-semibold hover:underline', l.certificate_revoked ? 'text-muted line-through' : 'text-blue')}>
                        Certificate ↗
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
