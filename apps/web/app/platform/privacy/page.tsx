import Link from 'next/link';
import { withUser } from '@talentral/db';
import { TopBar } from '@/components/top-bar';
import { Badge, Card, EmptyState } from '@/components/ui';
import { requirePlatformAdmin } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import type { DataRequest } from '@/lib/privacy';
import { CloseForm, EraseForm } from './forms';
import { ChevronLeft, ShieldCheck } from 'lucide-react';

export const metadata = { title: 'Privacy requests' };

// The platform team's queue of data-subject requests, oldest deadline first (NDPA: 30 days).
export default async function PrivacyQueue() {
  const user = await requirePlatformAdmin();
  const rows = await withUser(user.id, (tx) => tx<(DataRequest & { handled_by_email: string | null })[]>`
    select d.id, d.kind, d.details, d.status, d.email_masked, d.due_at, d.created_at, d.handled_at, d.outcome, u.email::text as handled_by_email
    from public.data_requests d left join public.users u on u.id = d.handled_by
    order by (d.status = 'open') desc, d.due_at asc, d.created_at desc limit 200`);
  const open = rows.filter((r) => r.status === 'open');
  const done = rows.filter((r) => r.status !== 'open');
  const now = Date.now();
  return (
    <div className="min-h-dvh">
      <TopBar user={user} />
      <main id="main" tabIndex={-1} className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <Link href="/platform" className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-ink"><ChevronLeft className="size-4" aria-hidden />Platform</Link>
          <h1 className="mt-2 text-3xl font-semibold">Privacy requests</h1>
          <p className="mt-1 text-muted">People asking to correct or delete their data. The Nigeria Data Protection Act gives us 30 days. Deletion keeps only anonymous records for funder reporting and the law.</p>
        </div>

        <section className="space-y-3" aria-label="Open requests">
          <h2 className="text-lg font-semibold">Open · {open.length}</h2>
          {open.length === 0 ? <EmptyState icon={ShieldCheck} title="Nothing waiting">New requests appear here and are emailed to the platform team.</EmptyState> : open.map((r) => {
            const days = Math.ceil((new Date(r.due_at).getTime() - now) / 86_400_000);
            return (
              <Card key={r.id} className={days < 0 ? 'border-danger/40 p-5' : 'p-5'}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.kind === 'erasure' ? 'Delete data' : 'Correct data'} · <span className="font-mono text-sm">{r.email_masked}</span></p>
                    <p className="text-sm text-muted">Asked {formatDate(r.created_at, true)}</p>
                  </div>
                  <Badge tone={days < 0 ? 'danger' : days <= 7 ? 'amber' : 'blue'}>{days < 0 ? `${-days} days overdue` : `Due in ${days} ${days === 1 ? 'day' : 'days'}`}</Badge>
                </div>
                {r.details && <p className="mt-3 rounded-lg bg-canvas/70 p-3 text-sm">{r.details}</p>}
                <div className="mt-4 space-y-3 border-t border-line pt-4">
                  {r.kind === 'erasure'
                    ? <EraseForm id={r.id} />
                    : <CloseForm id={r.id} status="completed" label="Mark corrected" />}
                  <CloseForm id={r.id} status="declined" label="Decline" />
                </div>
              </Card>
            );
          })}
        </section>

        {done.length > 0 && (
          <section className="space-y-2" aria-label="Closed requests">
            <h2 className="text-lg font-semibold">Closed</h2>
            <Card className="divide-y divide-line">
              {done.map((r) => (
                <div key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm">
                  <span className="min-w-0"><b>{r.kind === 'erasure' ? 'Delete' : 'Correct'}</b> · <span className="font-mono">{r.email_masked}</span>{r.outcome && <span className="block text-muted">{r.outcome}</span>}</span>
                  <span className="text-xs text-muted">{r.status} {r.handled_at ? formatDate(r.handled_at, true) : ''}{r.handled_by_email ? ` by ${r.handled_by_email}` : ''}</span>
                </div>
              ))}
            </Card>
          </section>
        )}
      </main>
    </div>
  );
}
