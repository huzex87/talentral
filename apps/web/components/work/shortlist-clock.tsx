import { Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { SHORTLIST_STATE_LABELS, shortlistState, timeLeft, type ShortlistState } from '@talentral/domain';
import { Badge, cx } from '@/components/ui';

export interface ShortlistFields { shortlist_requested_at: Date | null; shortlist_due_at: Date | null; shortlist_sent_at: Date | null }

export const stateOf = (r: ShortlistFields, now = new Date()): ShortlistState =>
  shortlistState({ requested_at: r.shortlist_requested_at, due_at: r.shortlist_due_at, sent_at: r.shortlist_sent_at }, now);

const TONE: Record<ShortlistState, 'neutral' | 'teal' | 'amber' | 'danger' | 'blue'> = { none: 'neutral', on_track: 'blue', due_soon: 'amber', overdue: 'danger', sent: 'teal' };

// The status of a shortlist request as a badge with an icon, so the state reads without colour.
export function ShortlistBadge({ state, due }: { state: ShortlistState; due?: Date | null }) {
  const Icon = state === 'sent' ? CheckCircle2 : state === 'overdue' ? AlertTriangle : Clock;
  return (
    <Badge tone={TONE[state]}>
      <span className="inline-flex items-center gap-1"><Icon className="size-3.5" aria-hidden />{SHORTLIST_STATE_LABELS[state]}{due && state !== 'sent' && state !== 'none' ? ` · ${timeLeft(due)}` : ''}</span>
    </Badge>
  );
}

export function ClockBar({ requested, due, now = new Date() }: { requested: Date; due: Date; now?: Date }) {
  const total = new Date(due).getTime() - new Date(requested).getTime();
  const used = Math.min(1, Math.max(0, (now.getTime() - new Date(requested).getTime()) / Math.max(total, 1)));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-hover" aria-hidden>
      <div className={cx('h-full rounded-full', used >= 1 ? 'bg-danger' : used > 0.66 ? 'bg-amber-600' : 'bg-blue')} style={{ width: `${Math.max(4, used * 100)}%` }} />
    </div>
  );
}
