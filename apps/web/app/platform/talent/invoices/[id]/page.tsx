import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { invoiceOverdue, watToday } from '@talentral/domain';
import { Alert, Card } from '@/components/ui';
import { InvoiceDocument, type InvoiceRow } from '@/components/work/invoice-document';
import { requirePlatformAdmin } from '@/lib/auth';
import { invoiceIssuer } from '@/lib/invoice-issuer';
import { InvoiceStatusForm } from '../../forms';
import { TalentShell } from '../../shell';

export const metadata = { title: 'Invoice' };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ issued?: string }> }) {
  const user = await requirePlatformAdmin();
  const { id } = await params;
  const { issued } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [inv] = await withUser(user.id, (tx) => tx<InvoiceRow[]>`
    select i.id, i.number, i.employer_name, i.role_title, i.candidate_name, i.start_date::text, i.fee_type, i.fee_percent::text, i.annual_pay::text,
      i.subtotal::text, i.vat_percent::text, i.vat::text, i.total::text, i.issued_at, i.due_on::text, i.replacement_until::text, i.status, i.paid_at,
      i.payment_reference, i.status_note, c.placement_type, coalesce(e.contact_email::text, e.contact_name) as employer_contact, e.state as employer_state
    from public.placement_invoices i join public.employers e on e.id = i.employer_id left join public.role_candidates c on c.id = i.candidate_id
    where i.id = ${id}`);
  if (!inv) notFound();
  const overdue = invoiceOverdue(inv, watToday(new Date()));
  const issuer = invoiceIssuer();
  return (
    <TalentShell user={user} active="invoices">
      <p className="mb-4 print:hidden"><Link href="/platform/talent/invoices" className="text-sm font-medium text-muted hover:text-ink">← Invoices</Link></p>
      {issued && <div className="mb-4 print:hidden"><Alert tone="teal" title={`Invoice ${inv.number} issued`}>The employer has been emailed. Record the payment here when it arrives.</Alert></div>}
      {!issuer.bank && <div className="mb-4 print:hidden"><Alert tone="amber">Bank details are not set. Add INVOICE_BANK, INVOICE_ACCOUNT_NAME and INVOICE_ACCOUNT_NUMBER to show them on invoices.</Alert></div>}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <InvoiceDocument inv={inv} issuer={issuer} overdue={overdue} />
        <aside className="print:hidden">
          <Card className="p-5">
            <h2 className="mb-3 text-base font-semibold">Payment</h2>
            <InvoiceStatusForm invoiceId={inv.id} status={inv.status} />
            <p className="mt-4 border-t border-line pt-4 text-xs text-muted">Use your browser’s Print to save this invoice as a PDF.</p>
          </Card>
        </aside>
      </div>
    </TalentShell>
  );
}
