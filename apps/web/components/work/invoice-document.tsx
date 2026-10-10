import { INVOICE_STATUS_LABELS, JOB_TYPES, naira, type InvoiceStatus } from '@talentral/domain';
import { TalentralLogo } from '@/components/logo';
import { Badge, cx } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { InvoiceIssuer } from '@/lib/invoice-issuer';

export interface InvoiceRow {
  id: string; number: string; employer_name: string; role_title: string; candidate_name: string; start_date: string;
  fee_type: 'percent' | 'flat'; fee_percent: string | null; annual_pay: string | null; subtotal: string; vat_percent: string; vat: string; total: string;
  issued_at: Date; due_on: string; replacement_until: string; status: InvoiceStatus; paid_at: Date | null; payment_reference: string | null; status_note: string | null;
  placement_type?: keyof typeof JOB_TYPES | null; employer_contact?: string | null; employer_state?: string | null;
}

const TONE: Record<InvoiceStatus, 'amber' | 'teal' | 'neutral'> = { issued: 'amber', paid: 'teal', waived: 'neutral', void: 'neutral' };

// The invoice as the employer receives it. Prints to one A4 page; amounts are whole naira.
export function InvoiceDocument({ inv, issuer, overdue }: { inv: InvoiceRow; issuer: InvoiceIssuer; overdue?: boolean }) {
  const n = (v: string | number) => naira(Number(v));
  return (
    <article className="rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-10 print:border-0 print:p-0 print:shadow-none" aria-label={`Invoice ${inv.number}`}>
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
        <div className="space-y-2">
          <TalentralLogo height={26} />
          <div className="text-sm text-muted">
            <p className="font-semibold text-ink">{issuer.name}</p>
            {issuer.address && <p className="whitespace-pre-line">{issuer.address}</p>}
            {issuer.email && <p>{issuer.email}</p>}
            {issuer.tin && <p>TIN {issuer.tin}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl font-semibold tracking-[-0.02em]">Invoice</p>
          <p className="mt-1 font-mono text-sm">{inv.number}</p>
          <div className="mt-2 flex justify-end gap-1.5">
            <Badge tone={overdue ? 'danger' : TONE[inv.status]}>{overdue ? 'Overdue' : INVOICE_STATUS_LABELS[inv.status]}</Badge>
          </div>
        </div>
      </header>

      <section className="grid gap-6 border-b border-line py-6 sm:grid-cols-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Billed to</p>
          <p className="mt-1 font-semibold">{inv.employer_name}</p>
          {inv.employer_state && <p className="text-sm text-muted">{inv.employer_state}</p>}
          {inv.employer_contact && <p className="text-sm text-muted">{inv.employer_contact}</p>}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Issued</p>
          <p className="mt-1 tabular-nums">{formatDate(inv.issued_at)}</p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted">Due</p>
          <p className={cx('mt-1 tabular-nums', overdue && 'font-semibold text-danger')}>{formatDate(inv.due_on)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Replacement guarantee</p>
          <p className="mt-1 text-sm">If the hire leaves before <b>{formatDate(inv.replacement_until)}</b>, Talentral finds a replacement at no further fee.</p>
        </div>
      </section>

      <div className="overflow-x-auto py-6" tabIndex={0} role="region" aria-label="Invoice lines">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="text-xs font-medium uppercase tracking-[0.04em] text-muted">
            <tr className="border-b border-line"><th className="pb-2 pr-4">Description</th><th className="pb-2 text-right">Amount</th></tr>
          </thead>
          <tbody>
            <tr className="border-b border-line align-top">
              <td className="py-3 pr-4">
                <p className="font-medium">Placement fee: {inv.candidate_name}, {inv.role_title}</p>
                <p className="text-muted">Started {formatDate(inv.start_date)}{inv.placement_type ? ` · ${JOB_TYPES[inv.placement_type]}` : ''}</p>
                <p className="text-muted">{inv.fee_type === 'percent' ? `${Number(inv.fee_percent)}% of first-year pay of ${n(inv.annual_pay!)}` : 'Agreed flat fee'}</p>
              </td>
              <td className="py-3 text-right tabular-nums">{n(inv.subtotal)}</td>
            </tr>
            {Number(inv.vat) > 0 && (
              <tr className="border-b border-line"><td className="py-3 pr-4">VAT at {Number(inv.vat_percent)}%</td><td className="py-3 text-right tabular-nums">{n(inv.vat)}</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr><td className="pt-4 pr-4 text-right font-semibold">Total due</td><td className="pt-4 text-right font-display text-2xl font-semibold tabular-nums">{n(inv.total)}</td></tr>
          </tfoot>
        </table>
      </div>

      <section className="grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">How to pay</p>
          {issuer.bank ? (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Bank</dt><dd>{issuer.bank.bank}</dd>
              <dt className="text-muted">Account name</dt><dd>{issuer.bank.accountName}</dd>
              <dt className="text-muted">Account number</dt><dd className="font-mono">{issuer.bank.accountNumber}</dd>
              <dt className="text-muted">Reference</dt><dd className="font-mono">{inv.number}</dd>
            </dl>
          ) : <p className="mt-2 text-sm text-muted">Bank details are sent separately by the Talentral team. Please quote {inv.number} with your payment.</p>}
        </div>
        <div className="text-sm text-muted">
          {inv.status === 'paid' && <p className="font-medium text-teal-700">Paid {formatDate(inv.paid_at)}{inv.payment_reference ? ` · ${inv.payment_reference}` : ''}. Thank you.</p>}
          {(inv.status === 'waived' || inv.status === 'void') && <p className="font-medium text-ink">{INVOICE_STATUS_LABELS[inv.status]}{inv.status_note ? `: ${inv.status_note}` : ''}</p>}
          <p className="mt-2">Payment is due within the date shown. No interest or late-payment charge is ever added.</p>
        </div>
      </section>
    </article>
  );
}
