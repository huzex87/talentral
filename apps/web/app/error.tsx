'use client';
// Anything that fails while loading a page lands here instead of the browser's bare error screen.
// The reference lets the Talentral team find the exact error in the logs.
import { useEffect } from 'react';
import { StatusPage } from '@/components/status-page';
import { Button, LinkButton } from '@/components/ui';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  return (
    <StatusPage title={offline ? 'You are offline' : 'Something went wrong on our side'}
      actions={<>
        <Button onClick={reset}>Try again</Button>
        <LinkButton variant="secondary" href="/">Go to the home page</LinkButton>
      </>}>
      <p>{offline ? 'Check your data or Wi-Fi connection, then try again. Lessons you saved for offline still work.' : 'Nothing you entered has been lost. Try again in a moment. If it keeps happening, tell your hub and share the reference below.'}</p>
      <p lang="ha">{offline ? 'Ba ka da haɗin intanet. Duba data ko Wi-Fi, sannan ka sake gwadawa.' : 'Wani abu ya lalace a ɓangarenmu. Ka sake gwadawa nan da ɗan lokaci.'}</p>
      {error.digest && <p className="pt-2 font-mono text-xs text-muted/80">Reference: {error.digest}</p>}
    </StatusPage>
  );
}
