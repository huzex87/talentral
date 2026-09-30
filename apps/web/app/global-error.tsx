'use client';
// Last resort when the root layout itself fails. It replaces the whole document, so it brings its own
// html and body, and the stylesheet.
import './globals.css';
import { StatusPage } from '@/components/status-page';
import { Button } from '@/components/ui';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <StatusPage title="Talentral could not load" actions={<Button onClick={reset}>Try again</Button>}>
          <p>Please try again in a moment. If it keeps happening, tell your hub and share the reference below.</p>
          {error.digest && <p className="pt-2 font-mono text-xs">Reference: {error.digest}</p>}
        </StatusPage>
      </body>
    </html>
  );
}
