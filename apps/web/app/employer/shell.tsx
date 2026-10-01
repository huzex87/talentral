import Link from 'next/link';
import type { User } from '@talentral/db';
import { TopBar } from '@/components/top-bar';
import { Alert, Badge, cx } from '@/components/ui';
import type { EmployerAccount } from '@/lib/employer';
import { formatDate } from '@/lib/format';
import { RequestReviewButton } from './forms';

export function EmployerStatusBadge({ status }: { status: EmployerAccount['status'] }) {
  return status === 'verified' ? <Badge tone="teal">✓ Verified employer</Badge> : status === 'pending' ? <Badge tone="amber">Pending verification</Badge>
    : status === 'rejected' ? <Badge tone="danger">Changes needed</Badge> : <Badge tone="danger">Paused</Badge>;
}

// Frame for the employer account: organisation name and status, the account's sections, and what
// to do while it is pending, needs changes or is paused.
export function EmployerShell({ user, employer, active = 'jobs', children }: { user: User; employer: EmployerAccount; active?: 'jobs' | 'team'; children: React.ReactNode }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link href={href} aria-current={on ? 'page' : undefined}
      className={cx('rounded-[10px] px-3 py-2 text-[15px] font-semibold transition', on ? 'bg-blue-50 text-blue' : 'text-muted hover:bg-white hover:text-ink')}>{label}</Link>
  );
  return (
    <div className="min-h-dvh">
      <TopBar user={user}>
        <Link href="/employer" className="hidden min-w-0 items-center gap-2 border-l border-line pl-4 sm:flex">
          <span className="truncate font-semibold">{employer.name}</span>
          <EmployerStatusBadge status={employer.status} />
        </Link>
      </TopBar>
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <nav aria-label="Employer account" className="mb-6 flex gap-1">
          {tab('/employer', 'Jobs and hiring', active === 'jobs')}
          {tab('/employer/team', 'Team', active === 'team')}
          <Link href="/jobs" className="ml-auto rounded-[10px] px-3 py-2 text-[15px] font-semibold text-muted hover:bg-white hover:text-ink">Jobs board ↗</Link>
        </nav>
        {employer.status === 'pending' && (
          <div className="mb-6"><Alert tone="amber" title={employer.review_requested_at ? 'We are reviewing your updated details' : 'We are verifying your organisation'}>
            The Talentral talent team checks every employer before it can post jobs or see candidates, usually within one working day. Adding your CAC registration number and a website on your company domain makes this faster. We will email you when it is done.
          </Alert></div>
        )}
        {employer.status === 'rejected' && (
          <div className="mb-6"><Alert tone="danger" title="We need a few more details before verifying you">
            {employer.review_note && <p className="mt-1"><b>From the talent team{employer.reviewed_at ? ` (${formatDate(employer.reviewed_at)})` : ''}:</b> {employer.review_note}</p>}
            <p className="mt-1">Update your organisation profile below, then ask us to look again.</p>
            <RequestReviewButton />
          </Alert></div>
        )}
        {employer.status === 'suspended' && (
          <div className="mb-6"><Alert tone="danger" title="Your account is paused">{employer.review_note ? `${employer.review_note} ` : ''}Contact the Talentral talent team to reactivate it.</Alert></div>
        )}
        {children}
      </main>
    </div>
  );
}
