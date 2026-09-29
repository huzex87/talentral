import { redirect } from 'next/navigation';
import { Alert } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { completeSignIn } from '@/lib/auth';
import { AuthShell } from '@/components/auth-shell';

export const metadata = { title: 'Confirm sign-in' };

// Email security scanners open links before people do, so signing in needs a click on this page.
async function confirm(form: FormData) {
  'use server';
  const ok = await completeSignIn(String(form.get('token') ?? ''));
  redirect(ok ? '/dashboard' : '/auth/verify?expired=1');
}

export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string; expired?: string }> }) {
  const { token, expired } = await searchParams;
  if (expired || !token) {
    return (
      <AuthShell title="This link has expired">
        <Alert tone="amber">Sign-in links work once and expire after 15 minutes. <a href="/sign-in" className="font-semibold underline">Request a new link</a>.</Alert>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Confirm sign-in" subtitle="Continue to your Talentral dashboard.">
      <form action={confirm}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton className="w-full" pendingLabel="Signing in…">Continue</SubmitButton>
      </form>
    </AuthShell>
  );
}
