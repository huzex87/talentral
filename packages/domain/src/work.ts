// Work Engine: the shortlist promise, invoice arithmetic and when to send job alerts. The database
// computes deadlines and invoice totals itself (app.add_working_days, app.issue_placement_invoice);
// these functions give screens the same answers before anything is saved.

const WAT_OFFSET_MS = 60 * 60 * 1000; // West Africa Time is UTC+1 all year
const DAY_MS = 86_400_000;

// Working days are Monday to Friday in West Africa Time, keeping the time of day. Starting at the
// weekend counts from 09:00 on Monday. Public holidays are not counted out.
export function addWorkingDays(from: Date, days: number): Date {
  let wat = new Date(from.getTime() + WAT_OFFSET_MS); // fields read as UTC are WAT wall time
  const dow = wat.getUTCDay(); // 0 Sunday … 6 Saturday
  if (dow === 0 || dow === 6) {
    const toMonday = dow === 6 ? 2 : 1;
    wat = new Date(Date.UTC(wat.getUTCFullYear(), wat.getUTCMonth(), wat.getUTCDate() + toMonday, 9));
  }
  let added = 0;
  while (added < days) {
    wat = new Date(wat.getTime() + DAY_MS);
    const d = wat.getUTCDay();
    if (d !== 0 && d !== 6) added += 1;
  }
  return new Date(wat.getTime() - WAT_OFFSET_MS);
}

export const SHORTLIST_WORKING_DAYS = 3;

export type ShortlistState = 'none' | 'on_track' | 'due_soon' | 'overdue' | 'sent';

export const SHORTLIST_STATE_LABELS: Record<ShortlistState, string> = {
  none: 'No shortlist requested',
  on_track: 'On track',
  due_soon: 'Due within a day',
  overdue: 'Overdue',
  sent: 'Shortlist sent',
};

// Where a shortlist request stands: sent, overdue, due within 24 hours, or on track.
export function shortlistState(r: { requested_at: Date | string | null; due_at: Date | string | null; sent_at: Date | string | null }, now = new Date()): ShortlistState {
  if (!r.requested_at || !r.due_at) return r.sent_at ? 'sent' : 'none';
  if (r.sent_at && new Date(r.sent_at) >= new Date(r.requested_at)) return 'sent';
  const left = new Date(r.due_at).getTime() - now.getTime();
  if (left < 0) return 'overdue';
  return left <= DAY_MS ? 'due_soon' : 'on_track';
}

// "2 days 4 hours left", "5 hours left" or "3 hours late", for the officer queue.
export function timeLeft(due: Date | string, now = new Date()): string {
  const ms = new Date(due).getTime() - now.getTime();
  const abs = Math.abs(ms);
  const days = Math.floor(abs / DAY_MS);
  const hours = Math.floor((abs % DAY_MS) / 3_600_000);
  const minutes = Math.max(1, Math.floor((abs % 3_600_000) / 60_000));
  const parts = days ? `${days} ${days === 1 ? 'day' : 'days'}${hours ? ` ${hours} ${hours === 1 ? 'hour' : 'hours'}` : ''}`
    : hours ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  return ms >= 0 ? `${parts} left` : `${parts} late`;
}

// ---------------------------------------------------------------- invoices

export type FeeType = 'percent' | 'flat';
export interface FeeTerms { fee_type: FeeType; fee_percent?: number | null; annual_pay?: number | null; flat?: number | null; vat_percent?: number | null }
export interface InvoiceTotals { subtotal: number; vat: number; total: number }

export const INVOICE_STATUS_LABELS = { issued: 'Awaiting payment', paid: 'Paid', waived: 'Waived', void: 'Void' } as const;
export type InvoiceStatus = keyof typeof INVOICE_STATUS_LABELS;
export const INVOICE_DUE_DAYS = 14;
export const REPLACEMENT_DAYS = 60;

// Whole naira, rounded half up, the same as the database.
export function invoiceTotals(t: FeeTerms): InvoiceTotals | null {
  let subtotal: number;
  if (t.fee_type === 'percent') {
    if (!t.fee_percent || t.fee_percent <= 0 || t.fee_percent > 50 || !t.annual_pay || t.annual_pay <= 0) return null;
    subtotal = Math.round((t.annual_pay * t.fee_percent) / 100);
  } else {
    if (!t.flat || t.flat <= 0) return null;
    subtotal = Math.round(t.flat);
  }
  const vatPct = t.vat_percent ?? 0;
  if (vatPct < 0 || vatPct > 20) return null;
  const vat = Math.round((subtotal * vatPct) / 100);
  return { subtotal, vat, total: subtotal + vat };
}

export const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

// An unpaid invoice past its due date is overdue (dates in West Africa Time, as YYYY-MM-DD).
export function invoiceOverdue(inv: { status: InvoiceStatus; due_on: string }, today: string): boolean {
  return inv.status === 'issued' && inv.due_on < today;
}

// Monthly pay ranges on jobs become a first-year figure for the fee: the midpoint, times twelve.
export function annualPayFromRange(min: number | null, max: number | null): number | null {
  const m = min && max ? (min + max) / 2 : min ?? max;
  return m ? Math.round(m * 12) : null;
}

// ---------------------------------------------------------------- job alerts

export const JOB_ALERT_MIN_SCORE = 50;
export const JOB_ALERTS_PER_DAY = 3;
export const JOB_ALERT_WINDOW_DAYS = 7;

// Alerts go out between 07:00 and 21:00 West Africa Time.
export function alertHours(now = new Date()): boolean {
  const h = new Date(now.getTime() + WAT_OFFSET_MS).getUTCHours();
  return h >= 7 && h < 21;
}
