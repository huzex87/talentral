'use client';
// A failure inside a hub page keeps the hub's navigation on screen and offers a way back.
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, LinkButton } from '@/components/ui';

export default function HubError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { hub } = useParams<{ hub: string }>();
  useEffect(() => { console.error(error); }, [error]);
  return (
    <Card className="mx-auto max-w-xl p-6 text-center sm:p-8" role="alert">
      <h1 className="text-xl font-semibold">This page did not load</h1>
      <p className="mt-2 text-[15px] text-muted">Nothing you saved has been lost. Try again, or go back to your hub’s overview. If it keeps happening, tell the Talentral team and share the reference below.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <LinkButton variant="secondary" href={`/dashboard/${hub}`}>Hub overview</LinkButton>
      </div>
      {error.digest && <p className="mt-4 font-mono text-xs text-muted">Reference: {error.digest}</p>}
    </Card>
  );
}
