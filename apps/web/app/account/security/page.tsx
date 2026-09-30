import Link from 'next/link';
import { TopBar } from '@/components/top-bar';
import { Alert, Badge, Card } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { twoStepStatus } from '@/lib/two-step';
import { ChangeTwoStep, SetupTwoStep } from './two-step-panel';

export const metadata = { title: 'Account security' };

export default async function Security({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const user = await requireUser();
  const { required } = await searchParams;
  const status = await twoStepStatus(user.id);
  return (
    <div className="min-h-dvh">
      <TopBar user={user} />
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <Link href="/dashboard" className="text-sm font-semibold text-violet hover:underline">← Back</Link>
        <h1 className="mt-2 text-3xl font-semibold">Account and security</h1>
        <p className="mt-1 text-muted">{user.email}</p>

        {required && !status.enabled && (
          <div className="mt-5"><Alert tone="amber" title="Your hub requires two-step sign-in">Set it up below to continue to your hub dashboard. It takes about two minutes.</Alert></div>
        )}

        <Card className="mt-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Two-step sign-in</h2>
              <p className="mt-1 text-sm text-muted">After your email link or SMS code, Talentral also asks for a code from an authenticator app on your phone, such as Google Authenticator or Microsoft Authenticator. Someone who gets into your email still cannot get into Talentral.</p>
            </div>
            {status.enabled ? <Badge tone="teal">On since {formatDate(status.enabledAt!)}</Badge> : <Badge tone="neutral">Off</Badge>}
          </div>
          <div className="mt-5">
            {status.enabled
              ? <ChangeTwoStep recoveryLeft={status.recoveryLeft} requiredBy={status.requiredBy} />
              : <SetupTwoStep continueTo={required ? `/dashboard/${required}` : null} />}
          </div>
        </Card>

        <Card className="mt-6 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Your data</h2>
          <p className="mt-1 text-sm text-muted">See, download, correct or delete the personal data Talentral holds about you: your account, applications, attendance, grades, certificates, Passport and consent history. These are your rights under the Nigeria Data Protection Act.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/account/privacy" className="inline-flex h-11 items-center rounded-[var(--radius-control)] bg-blue px-5 text-[15px] font-semibold text-white hover:bg-blue-600">Manage your data</Link>
            <a href="/account/export" className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-control)] border border-blue/60 bg-white px-5 text-[15px] font-semibold text-blue hover:bg-blue-50" download>⬇ Download my data</a>
          </div>
        </Card>
      </main>
    </div>
  );
}
