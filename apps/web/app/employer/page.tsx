import { BriefcaseBusiness } from 'lucide-react';
import Link from 'next/link';
import { withUser } from '@talentral/db';
import { INVOICE_STATUS_LABELS, JOB_TYPES, WORK_MODES, invoiceOverdue, naira, payRange, watToday, type InvoiceStatus } from '@talentral/domain';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { requireEmployer } from '@/lib/employer';
import { formatDate } from '@/lib/format';
import { EmployerProfileForm, JobForm } from './forms';
import { EmployerShell } from './shell';

export const metadata = { title: 'Employer account' };

type Job = { id: string; title: string; status: 'draft' | 'open' | 'filled' | 'closed'; work_mode: keyof typeof WORK_MODES; job_type: keyof typeof JOB_TYPES;
  state: string | null; pay_min: number | null; pay_max: number | null; created_at: Date; invited: number; interested: number; hired: number; retention_due: number;
  fresh: number; to_confirm: number };

export default async function EmployerHome() {
  const { user, employer } = await requireEmployer();
  const { jobs, skills, invoices } = await withUser(user.id, async (tx) => ({
    jobs: await tx<Job[]>`
      select r.id, r.title, r.status, r.work_mode, r.job_type, r.state, r.pay_min, r.pay_max, r.created_at,
        (select count(*)::int from public.role_candidates c where c.role_id = r.id) as invited,
        (select count(*)::int from public.role_candidates c where c.role_id = r.id and c.interest = 'confirmed') as interested,
        (select count(*)::int from public.role_candidates c where c.role_id = r.id and c.stage = 'placed') as hired,
        (select count(*)::int from public.role_candidates c where c.role_id = r.id and c.stage = 'placed' and c.retained is null and c.start_date <= current_date - 90) as retention_due,
        (select count(*)::int from public.role_candidates c where c.role_id = r.id and c.source = 'applied' and c.interest = 'confirmed' and c.stage = 'shortlisted'
           and c.applied_at > now() - interval '3 days') as fresh,
        (select count(*)::int from public.role_candidates c where c.role_id = r.id and c.stage = 'placed' and c.placement_confirmed_at is null) as to_confirm
      from public.job_roles r where r.employer_id = ${employer.id} order by (r.status = 'draft') desc, (r.status = 'open') desc, r.created_at desc`,
    skills: await tx<{ name: string; track: string }[]>`select name, track from public.skills where tenant_id is null order by track, name`,
    invoices: await tx<{ id: string; number: string; candidate_name: string; total: string; due_on: string; status: InvoiceStatus }[]>`
      select id, number, candidate_name, total::text, due_on::text, status from public.placement_invoices where employer_id = ${employer.id} order by issued_at desc limit 12`,
  }));
  const today = watToday(new Date());
  const totals = jobs.reduce((a, j) => ({ open: a.open + (j.status === 'open' ? 1 : 0), interested: a.interested + j.interested, hired: a.hired + j.hired }), { open: 0, interested: 0, hired: 0 });

  return (
    <EmployerShell user={user} employer={employer}>
      <PageHeader label="Employer account" title={employer.name}
        description={employer.status === 'verified' ? `Verified on ${formatDate(employer.verified_at)} · ${totals.open} open jobs · ${totals.interested} applicants and interested candidates · ${totals.hired} hired` : 'Complete your profile while we verify your organisation.'} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Your jobs</h2>
            {jobs.length === 0 ? (
              <EmptyState icon={BriefcaseBusiness} title="No jobs yet">{employer.status === 'verified' ? 'Post your first job below to see ranked matches.' : 'You can post jobs once your organisation is verified.'}</EmptyState>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {jobs.map((j) => {
                  const pay = payRange(j.pay_min, j.pay_max);
                  return (
                    <Link key={j.id} href={`/employer/jobs/${j.id}`}>
                      <Card className="h-full p-5 transition hover:border-blue/40 hover:shadow-md">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-display text-lg font-semibold">{j.title}</p>
                          <Badge tone={j.status === 'open' ? 'teal' : j.status === 'filled' ? 'violet' : j.status === 'draft' ? 'amber' : 'neutral'}>{j.status === 'open' ? 'Open' : j.status === 'filled' ? 'Filled' : j.status === 'draft' ? 'Draft' : 'Closed'}</Badge>
                        </div>
                        <p className="text-sm text-muted">{WORK_MODES[j.work_mode]} · {JOB_TYPES[j.job_type]}{j.state ? ` · ${j.state}` : ''}</p>
                        {pay && <p className="mt-1 text-sm font-semibold">{pay}</p>}
                        <p className="mt-3 text-sm text-muted"><b className="text-ink">{j.interested}</b> {j.interested === 1 ? 'applicant' : 'applicants'} · <b className="text-ink">{j.invited - j.interested}</b> other invited · <b className="text-teal-700">{j.hired}</b> hired</p>
                        {(j.fresh > 0 || j.to_confirm > 0 || j.retention_due > 0) && (
                          <p className="mt-2 flex flex-wrap gap-1.5">
                            {j.fresh > 0 && <Badge tone="violet">{j.fresh} new {j.fresh === 1 ? 'applicant' : 'applicants'}</Badge>}
                            {j.to_confirm > 0 && <Badge tone="violet">Confirm a hire</Badge>}
                            {j.retention_due > 0 && <Badge tone="amber">90-day check due</Badge>}
                          </p>
                        )}
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
          {employer.status === 'verified' && (
            <Card className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Post a job</h2>
              <p className="mb-4 mt-1 text-sm text-muted">You will see ranked matches straight away, each with the reasons behind it. Listed jobs also appear on the Talentral jobs board, where learners see which of your skills they have proven.</p>
              <JobForm skills={skills} />
            </Card>
          )}
        </div>
        <aside className="space-y-4">
          {invoices.length > 0 && (
            <Card className="p-5" role="region" aria-labelledby="invoices-h">
              <h2 id="invoices-h" className="mb-3 text-lg font-semibold">Invoices</h2>
              <ul className="divide-y divide-line text-sm">
                {invoices.map((i) => {
                  const late = invoiceOverdue(i, today);
                  return (
                    <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="min-w-0">
                        <Link href={`/employer/invoices/${i.id}`} className="font-mono font-medium hover:text-blue">{i.number}</Link>
                        <span className="block truncate text-xs text-muted">{i.candidate_name} · {late ? 'overdue' : i.status === 'issued' ? `due ${formatDate(i.due_on)}` : INVOICE_STATUS_LABELS[i.status].toLowerCase()}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-medium tabular-nums">{naira(Number(i.total))}</span>
                        <Badge tone={late ? 'danger' : i.status === 'paid' ? 'teal' : i.status === 'issued' ? 'amber' : 'neutral'}>{late ? 'Overdue' : INVOICE_STATUS_LABELS[i.status]}</Badge>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          <Card className="p-5">
            <h2 className="mb-4 text-lg font-semibold">Organisation profile</h2>
            <EmployerProfileForm employer={employer} />
          </Card>
          <Card className="p-5 text-sm text-muted">
            <h2 className="mb-2 text-sm font-semibold text-ink">How candidate data works</h2>
            <p>You see people who chose to be found by verified employers. You get their email and phone only after they say yes to your invitation. Use their details only to recruit for the job, and never charge candidates a fee.</p>
          </Card>
        </aside>
      </div>
    </EmployerShell>
  );
}
