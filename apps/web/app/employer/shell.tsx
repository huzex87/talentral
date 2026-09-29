import Link from 'next/link';
import type { User } from '@talentral/db';
import { TopBar } from '@/components/top-bar';
import { Alert, Badge } from '@/components/ui';
import type { EmployerAccount } from '@/lib/employer';

// Frame for the employer account: organisation name, status, and a notice while it is pending.
export function EmployerShell({ user, employer, children }: { user: User; employer: EmployerAccount; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <TopBar user={user}>
        <Link href="/employer" className="hidden min-w-0 items-center gap-2 border-l border-line pl-4 sm:flex">
          <span className="truncate font-semibold">{employer.name}</span>
          {employer.status === 'verified' ? <Badge tone="teal">Verified employer</Badge> : employer.status === 'pending' ? <Badge tone="amber">Pending verification</Badge> : <Badge tone="danger">Paused</Badge>}
        </Link>
      </TopBar>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {employer.status === 'pending' && (
          <div className="mb-6"><Alert tone="amber" title="We are verifying your organisation">
            The Talentral talent team checks every employer before it can post jobs or see candidates, usually within one working day. We will email you when it is done. You can complete your profile meanwhile.
          </Alert></div>
        )}
        {employer.status === 'suspended' && <div className="mb-6"><Alert tone="danger" title="Your account is paused">Contact the Talentral talent team to reactivate it.</Alert></div>}
        {children}
      </main>
    </div>
  );
}
