import Link from 'next/link';
import { TopBar } from '@/components/top-bar';
import { Alert, Badge, Card } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { KEPT_AFTER_DELETION } from '@/lib/mail';
import { myRequests } from '@/lib/privacy';
import { cancel } from './actions';
import { CorrectForm, DeleteForm } from './forms';
import { ChevronLeft } from 'lucide-react';

export const metadata = { title: 'Your data' };

const STATUS = { open: ['In progress', 'blue'], completed: ['Done', 'teal'], declined: ['Declined', 'amber'], cancelled: ['Cancelled', 'neutral'] } as const;

// The person's data rights in one place: see it, download it, correct it, delete it (NDPA 2023).
export default async function YourData() {
  const user = await requireUser();
  const requests = await myRequests(user.id);
  const openErasure = requests.some((r) => r.kind === 'erasure' && r.status === 'open');
  return (
    <div className="min-h-dvh">
      <TopBar user={user} />
      <main id="main" tabIndex={-1} className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <Link href="/account/security" className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-ink"><ChevronLeft className="size-4" aria-hidden />Account and security</Link>
          <h1 className="mt-2 text-3xl font-semibold">Your data</h1>
          <p className="mt-1 text-muted">Under the Nigeria Data Protection Act you can see, correct and delete the personal data Talentral holds about you. We answer every request within 30 days.</p>
        </div>

        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold">See your data</h2>
          <p className="mt-1 text-sm text-muted">Everything linked to {user.email}: your account, applications, attendance, grades, certificates, Passport and consent history.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/account/data" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0 h-10 px-4 text-sm bg-blue text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(16,24,40,0.10)] hover:bg-blue-600">View and print (PDF)</Link>
            <a href="/account/export" download className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0 h-10 px-4 text-sm bg-white text-ink border border-line-strong shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:bg-hover hover:border-mist">Download as a file (JSON)</a>
          </div>
        </Card>

        {requests.length > 0 && (
          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Your requests</h2>
            <ul className="mt-3 divide-y divide-line" aria-label="Your requests">
              {requests.map((r) => {
                const [label, tone] = STATUS[r.status];
                return (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold">{r.kind === 'erasure' ? 'Delete my data' : 'Correct my data'} <span className="font-normal text-muted">· asked {formatDate(r.created_at)}</span></p>
                      {r.details && <p className="mt-0.5 text-muted">{r.details}</p>}
                      {r.status === 'open' && <p className="mt-0.5 text-muted">We will handle it by {formatDate(r.due_at)}.</p>}
                      {r.outcome && r.status !== 'open' && <p className="mt-0.5">{r.outcome}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={tone}>{label}</Badge>
                      {r.status === 'open' && <form action={cancel.bind(null, r.id)}><button className="text-xs font-semibold text-muted hover:text-danger">Cancel request</button></form>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Correct your data</h2>
          <p className="mt-1 mb-4 text-sm text-muted">Tell us what is wrong and we will fix it. Hubs can also correct details on your applications.</p>
          <CorrectForm />
        </Card>

        <Card className="border-danger/25 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Delete your data</h2>
          <p className="mt-1 text-sm text-muted">We delete your account, your contact details, your application answers, your uploaded files, your written work and your discussion posts. <b className="text-ink">Your certificates will no longer be valid</b>, so download your data first if you want a copy.</p>
          <div className="mt-4 rounded-xl bg-canvas/70 p-4 text-sm">
            <p className="font-semibold">What we keep, without your name or contact details</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{KEPT_AFTER_DELETION.map((k) => <li key={k}>{k}</li>)}</ul>
          </div>
          <div className="mt-5">
            {openErasure ? <Alert tone="blue" title="Your deletion request is in progress">We have emailed you a receipt. You can still cancel it under Your requests until we carry it out.</Alert> : <DeleteForm />}
          </div>
        </Card>
      </main>
    </div>
  );
}
