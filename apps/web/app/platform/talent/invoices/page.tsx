import Link from 'next/link';
import { Receipt } from 'lucide-react';
import { withUser } from '@talentral/db';
import { INVOICE_STATUS_LABELS, annualPayFromRange, invoiceOverdue, naira, watToday, type InvoiceStatus } from '@talentral/domain';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { requirePlatformAdmin } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { IssueInvoiceForm } from '../forms';
import { Stat, TalentShell } from '../shell';

export const metadata = { title: 'Invoices' };

type ToInvoice = { id: string; person: string; role: string; employer: string; start_date: string; confirmed: boolean; pay_min: number | null; pay_max: number | null };
type Invoice = { id: string; number: string; employer_name: string; candidate_name: string; role_title: string; total: string; issued_at: Date; due_on: string; status: InvoiceStatus; paid_at: Date | null };

const TONE: Record<InvoiceStatus, 'amber' | 'teal' | 'neutral'> = { issued: 'amber', paid: 'teal', waived: 'neutral', void: 'neutral' };

// Placement revenue: confirmed hires waiting for an invoice, and every invoice with its status.
export default async function Invoices() {
  const user = await requirePlatformAdmin();
  const { toInvoice, invoices } = await withUser(user.id, async (tx) => ({
    toInvoice: await tx<ToInvoice[]>`
      select c.id, coalesce(u.full_name, u.email::text) as person, r.title as role, e.name as employer, c.start_date::text,
        c.placement_confirmed_at is not null as confirmed, r.pay_min, r.pay_max
      from public.role_candidates c join public.job_roles r on r.id = c.role_id join public.employers e on e.id = r.employer_id join public.users u on u.id = c.user_id
      where c.stage = 'placed' and c.start_date is not null and not exists (select 1 from public.placement_invoices i where i.candidate_id = c.id)
      order by c.placement_confirmed_at is not null desc, c.start_date desc`,
    invoices: await tx<Invoice[]>`
      select id, number, employer_name, candidate_name, role_title, total::text, issued_at, due_on::text, status, paid_at
      from public.placement_invoices order by issued_at desc limit 200`,
  }));
  const today = watToday(new Date());
  const year = today.slice(0, 4);
  const sum = (rows: Invoice[]) => rows.reduce((t, r) => t + Number(r.total), 0);
  const outstanding = invoices.filter((i) => i.status === 'issued');
  const overdue = outstanding.filter((i) => invoiceOverdue(i, today));
  const paidThisYear = invoices.filter((i) => i.status === 'paid' && i.paid_at && new Date(i.paid_at).toISOString().slice(0, 4) === year);

  return (
    <TalentShell user={user} active="invoices">
      <PageHeader label="Talent officer console" title="Invoices"
        description="Each confirmed hire can be invoiced once: a percentage of first-year pay or a flat fee, in naira, with a 60-day replacement guarantee. No interest or late-payment charge is ever added." />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Outstanding" value={naira(sum(outstanding))} />
        <Stat label={`Overdue (${overdue.length})`} value={naira(sum(overdue))} />
        <Stat label={`Paid in ${year}`} value={naira(sum(paidThisYear))} />
        <Stat label="Hires to invoice" value={toInvoice.length} />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Hires to invoice</h2>
        {toInvoice.length === 0 ? <Card className="p-5 text-sm text-muted">Every recorded hire has an invoice.</Card> : (
          <ul className="space-y-3" aria-label="Hires to invoice">
            {toInvoice.map((p) => (
              <li key={p.id}>
                <Card className="p-5">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{p.person} · {p.role}</p>
                      <p className="text-sm text-muted">{p.employer} · started {formatDate(p.start_date)}</p>
                    </div>
                    <Badge tone={p.confirmed ? 'teal' : 'amber'}>{p.confirmed ? 'Hire confirmed' : 'Not yet confirmed'}</Badge>
                  </div>
                  {!p.confirmed && <p className="mb-3 text-sm text-amber-800">Best to wait for the employer to confirm the hire before invoicing.</p>}
                  <IssueInvoiceForm candidateId={p.id} suggestedAnnual={annualPayFromRange(p.pay_min, p.pay_max)} />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">All invoices</h2>
        {invoices.length === 0 ? <EmptyState icon={Receipt} title="No invoices yet">Invoices appear here once you issue one for a confirmed hire.</EmptyState> : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Invoices table">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-line bg-canvas/70 text-xs font-medium text-muted">
                  <tr><th className="px-5 py-2.5">Invoice</th><th className="px-4 py-2.5">Employer</th><th className="px-4 py-2.5">For</th><th className="px-4 py-2.5 text-right">Total</th><th className="px-4 py-2.5">Due</th><th className="px-4 py-2.5">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {invoices.map((i) => {
                    const late = invoiceOverdue(i, today);
                    return (
                      <tr key={i.id} className="hover:bg-canvas/60">
                        <td className="px-5 py-3"><Link href={`/platform/talent/invoices/${i.id}`} className="font-mono font-medium hover:text-blue">{i.number}</Link><span className="block text-xs text-muted">{formatDate(i.issued_at)}</span></td>
                        <td className="px-4 py-3">{i.employer_name}</td>
                        <td className="px-4 py-3">{i.candidate_name}<span className="block text-xs text-muted">{i.role_title}</span></td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{naira(Number(i.total))}</td>
                        <td className="px-4 py-3 tabular-nums">{formatDate(i.due_on)}</td>
                        <td className="px-4 py-3"><Badge tone={late ? 'danger' : TONE[i.status]}>{late ? 'Overdue' : INVOICE_STATUS_LABELS[i.status]}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </TalentShell>
  );
}
