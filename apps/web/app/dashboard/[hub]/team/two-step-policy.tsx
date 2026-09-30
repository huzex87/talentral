'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Alert, cx } from '@/components/ui';
import { setRequireTwoStep, type TeamState } from './actions';

export function TwoStepPolicy({ slug, on, canChange, withTwoStep, total }: { slug: string; on: boolean; canChange: boolean; withTwoStep: number; total: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TeamState | null>(null);
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id="require-two-step" className="font-semibold">Require two-step sign-in for this team</p>
          <p className="mt-0.5 text-sm text-muted">Everyone on the team needs a code from an authenticator app as well as their email link. Members without it are asked to set it up before they can open the dashboard.</p>
          <p className="mt-1 text-xs font-semibold text-muted">{withTwoStep} of {total} members have it on. <Link href="/account/security" className="text-blue hover:underline">Your security settings</Link></p>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-labelledby="require-two-step" disabled={pending || !canChange}
          onClick={() => start(async () => setResult(await setRequireTwoStep(slug, !on)))}
          className={cx('relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-60', on ? 'bg-teal-700' : 'bg-mist')}>
          <span className={cx('inline-block size-5 rounded-full bg-white shadow transition', on ? 'translate-x-6' : 'translate-x-1')} />
        </button>
      </div>
      {!canChange && <p className="mt-2 text-xs text-muted">Only owners can change this.</p>}
      {result?.message && <div className="mt-3"><Alert tone="amber">{result.message}</Alert></div>}
    </div>
  );
}
