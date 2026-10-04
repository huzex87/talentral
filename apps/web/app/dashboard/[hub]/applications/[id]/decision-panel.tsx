'use client';
import { useState, useTransition } from 'react';
import { STATUS_LABELS, isNotifiedStatus, type ApplicationStatus } from '@talentral/domain';
import { Alert, Button, Card } from '@/components/ui';
import { moveApplication } from './actions';

// Status buttons for one application, with the choice to email the applicant about the decision.
export function DecisionPanel({ slug, id, status, moves }: { slug: string; id: string; status: ApplicationStatus; moves: ApplicationStatus[] }) {
  const [notify, setNotify] = useState(true);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const canNotify = moves.some(isNotifiedStatus);

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-ink">Decision</h2>
      <p className="mt-2 text-[15px]">Current: <b>{STATUS_LABELS[status]}</b></p>
      {moves.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {moves.map((m) => (
            <Button key={m} className="w-full" size="sm" disabled={pending}
              variant={m === 'rejected' || m === 'withdrawn' ? 'danger' : m === 'shortlisted' || m === 'offered' || m === 'accepted' ? 'primary' : 'secondary'}
              onClick={() => start(async () => setResult(await moveApplication(slug, id, m, notify && isNotifiedStatus(m))))}>
              {m === 'under_review' ? 'Start review' : `Mark as ${STATUS_LABELS[m].toLowerCase()}`}
            </Button>
          ))}
        </div>
      ) : <p className="mt-2 text-sm text-muted">No further changes.</p>}
      {canNotify && (
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="mt-0.5 size-4 accent-blue" />
          <span>Email the applicant about shortlisting, offers and decisions</span>
        </label>
      )}
      {result && <div className="mt-3"><Alert tone={result.ok ? 'teal' : 'danger'}>{result.message}</Alert></div>}
    </Card>
  );
}
