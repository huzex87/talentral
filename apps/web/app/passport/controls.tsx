'use client';
import { useState, useTransition } from 'react';
import { Alert, Button, cx } from '@/components/ui';
import { respondToOpportunity, setConsent, type ConsentKind, type PassportState } from './actions';

const COPY: Record<ConsentKind, { title: string; body: string }> = {
  discoverable: { title: 'Visible to Talentral talent officers', body: 'Talent officers can find your Passport and suggest you for jobs. Turning this off removes you from search immediately.' },
  employer_sharing: { title: 'Share with employers I say yes to', body: 'When you confirm interest in a job, the employer can see your Passport through a private link that expires after 14 days.' },
  research: { title: 'Include me in anonymised research', body: 'Your record may be counted, without your name, in reports on programme outcomes.' },
};

export function ConsentSwitch({ kind, on, since, blocked }: { kind: ConsentKind; on: boolean; since: string | null; blocked?: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PassportState | null>(null);
  const { title, body } = COPY[kind];
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id={`consent-${kind}`} className="font-semibold">{title}</p>
          <p className="mt-0.5 text-sm text-muted">{body}</p>
          <p className="mt-1 text-xs font-semibold text-muted">{on ? `On since ${since}` : 'Off'}</p>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-labelledby={`consent-${kind}`} disabled={pending}
          onClick={() => start(async () => setResult(await setConsent(kind, !on)))}
          className={cx('relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-60', on ? 'bg-teal-700' : 'bg-mist')}>
          <span className={cx('inline-block size-5 rounded-full bg-white shadow transition', on ? 'translate-x-6' : 'translate-x-1')} />
        </button>
      </div>
      {!on && blocked && <p className="mt-2 text-xs text-amber-800">{blocked}</p>}
      {result?.message && <div className="mt-2"><Alert tone="amber">{result.message}</Alert></div>}
    </div>
  );
}

export function InterestButtons({ id, role }: { id: string; role: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PassportState | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={pending} onClick={() => start(async () => setResult(await respondToOpportunity(id, 'confirmed')))} aria-label={`I am interested in ${role}`}>I am interested</Button>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => setResult(await respondToOpportunity(id, 'declined')))} aria-label={`Not for me: ${role}`}>Not for me</Button>
      {result?.message && <span className="text-sm text-danger">{result.message}</span>}
    </div>
  );
}
