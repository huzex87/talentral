'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { STATUS_LABELS, isNotifiedStatus, type ApplicationStatus } from '@talentral/domain';
import { Alert, Button, Card } from '@/components/ui';
import { moveApplication, resendWelcome } from './actions';

type Result = { ok: boolean; message: string } | null;

// Status buttons for one application, with the choice to email the applicant about the decision.
// Once accepted, it shows where the learner is in onboarding and can resend the welcome email.
export function DecisionPanel({ slug, id, status, moves, cohort }: {
  slug: string; id: string; status: ApplicationStatus; moves: ApplicationStatus[]; cohort: { id: string; name: string } | null;
}) {
  const [notify, setNotify] = useState(true);
  const [result, setResult] = useState<Result>(null);
  const [resent, setResent] = useState<Result>(null);
  const [pending, start] = useTransition();
  const canNotify = moves.some(isNotifiedStatus);

  return (
    <Card id="decision" className="scroll-mt-20 p-5">
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
          <span>Email the applicant about shortlisting, offers and decisions. Acceptance emails include a link to their learner account.</span>
        </label>
      )}
      {result && <div className="mt-3"><Alert tone={result.ok ? 'teal' : 'danger'}>{result.message}</Alert></div>}

      {status === 'accepted' && (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-sm font-semibold text-ink">Onboarding</h3>
          <p className="mt-1.5 text-sm text-muted">
            {cohort
              ? <>In <Link href={`/dashboard/${slug}/cohorts/${cohort.id}`} className="font-medium text-blue hover:underline">{cohort.name}</Link>. Their course and class times show in their learner account.</>
              : <>Not in a cohort yet. Add them from <Link href={`/dashboard/${slug}/cohorts`} className="font-medium text-blue hover:underline">Cohorts</Link> and they get an email to start learning.</>}
          </p>
          <Button className="mt-3 w-full" size="sm" variant="secondary" disabled={pending}
            onClick={() => start(async () => setResent(await resendWelcome(slug, id)))}>
            <Mail className="size-4" aria-hidden strokeWidth={1.75} />Send welcome email again
          </Button>
          {resent && <div className="mt-3"><Alert tone={resent.ok ? 'teal' : 'danger'}>{resent.message}</Alert></div>}
        </div>
      )}
    </Card>
  );
}
