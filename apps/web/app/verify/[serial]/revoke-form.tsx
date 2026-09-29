'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import { revokeCertificate } from '@/app/dashboard/[hub]/cohorts/actions';

// Shown only to owners and admins of the issuing hub.
export function RevokeForm({ slug, serial }: { slug: string; serial: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-danger hover:underline">Revoke this certificate</button>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Reason, shown publicly" aria-label="Reason for revoking" className="h-10 w-72 text-sm" />
      <Button size="sm" variant="danger" disabled={pending} onClick={() => start(async () => {
        const r = await revokeCertificate(slug, serial, reason);
        if (r.ok) router.refresh(); else setError(r.message ?? 'Not revoked.');
      })}>Revoke</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  );
}
