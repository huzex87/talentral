import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { invoiceOverdue, watToday } from '@talentral/domain';
import { InvoiceDocument, type InvoiceRow } from '@/components/work/invoice-document';
import { requireEmployer } from '@/lib/employer';
import { invoiceIssuer } from '@/lib/invoice-issuer';
import { EmployerShell } from '../../shell';

export const metadata = { title: 'Invoice' };

// An employer's own invoice. Row-level security shows it only to members of that employer.
export default async function EmployerInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { user, employer } = await requireEmployer();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [inv] = await withUser(user.id, (tx) => tx<InvoiceRow[]>`
    select i.id, i.number, i.employer_name, i.role_title, i.candidate_name, i.start_date::text, i.fee_type, i.fee_percent::text, i.annual_pay::text,
      i.subtotal::text, i.vat_percent::text, i.vat::text, i.total::text, i.issued_at, i.due_on::text, i.replacement_until::text, i.status, i.paid_at,
      i.payment_reference, i.status_note, null as placement_type, null as employer_contact, null as employer_state
    from public.placement_invoices i where i.id = ${id} and i.employer_id = ${employer.id}`);
  if (!inv) notFound();
  return (
    <EmployerShell user={user} employer={employer}>
      <p className="mb-4 print:hidden"><Link href="/employer" className="text-sm font-medium text-muted hover:text-ink">← Your jobs</Link></p>
      <InvoiceDocument inv={inv} issuer={invoiceIssuer()} overdue={invoiceOverdue(inv, watToday(new Date()))} />
      <p className="mt-4 text-center text-xs text-muted print:hidden">Use your browser’s Print to save this invoice as a PDF. Questions? Reply to the email it came with.</p>
    </EmployerShell>
  );
}
