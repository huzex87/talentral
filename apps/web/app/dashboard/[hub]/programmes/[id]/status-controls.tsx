'use client';
import { useState, useTransition } from 'react';
import type { Programme } from '@talentral/db';
import { Alert, Button } from '@/components/ui';
import { setStatus, type ProgState } from '../actions';

export function StatusControls({ slug, id, status }: { slug: string; id: string; status: Programme['status'] }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ProgState | null>(null);
  const go = (s: Programme['status'], confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => setResult(await setStatus(slug, id, s)));
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status !== 'open' && <Button disabled={pending} onClick={() => go('open')}>{pending ? 'Working…' : 'Open applications'}</Button>}
        {status === 'open' && <Button variant="danger" disabled={pending} onClick={() => go('closed', 'Close applications now? Applicants will no longer be able to apply.')}>Close applications</Button>}
        {status !== 'draft' && <Button variant="ghost" disabled={pending} onClick={() => go('draft', 'Move back to draft? The public page will be hidden.')}>Back to draft</Button>}
      </div>
      {result && <Alert tone={result.ok ? 'teal' : 'danger'}>{result.message}</Alert>}
    </div>
  );
}
