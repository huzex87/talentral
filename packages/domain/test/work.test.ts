import { describe, expect, it } from 'vitest';
import { addWorkingDays, alertHours, annualPayFromRange, invoiceOverdue, invoiceTotals, naira, shortlistState, timeLeft } from '../src';

// Times are written in West Africa Time (UTC+1).
const wat = (s: string) => new Date(`${s}+01:00`);

describe('working days for the shortlist promise', () => {
  it('counts Monday to Friday and keeps the time of day', () => {
    expect(addWorkingDays(wat('2026-10-12T10:00:00'), 3)).toEqual(wat('2026-10-15T10:00:00')); // Monday to Thursday
    expect(addWorkingDays(wat('2026-10-16T15:00:00'), 3)).toEqual(wat('2026-10-21T15:00:00')); // Friday to Wednesday
  });
  it('starts a weekend request at 09:00 on Monday', () => {
    expect(addWorkingDays(wat('2026-10-17T22:30:00'), 3)).toEqual(wat('2026-10-22T09:00:00')); // Saturday night
    expect(addWorkingDays(wat('2026-10-18T08:00:00'), 3)).toEqual(wat('2026-10-22T09:00:00')); // Sunday morning
  });
  it('works across a month end and with UTC times that are already the next WAT day', () => {
    expect(addWorkingDays(wat('2026-10-30T09:00:00'), 3)).toEqual(wat('2026-11-04T09:00:00'));
    // 23:30 UTC on Friday is 00:30 on Saturday in Lagos: the count starts at 09:00 on Monday.
    expect(addWorkingDays(new Date('2026-10-16T23:30:00Z'), 1)).toEqual(wat('2026-10-20T09:00:00'));
  });
});

describe('shortlist state', () => {
  const requested = wat('2026-10-12T10:00:00');
  const due = wat('2026-10-15T10:00:00');
  it('tracks the clock until the shortlist is sent', () => {
    expect(shortlistState({ requested_at: null, due_at: null, sent_at: null })).toBe('none');
    expect(shortlistState({ requested_at: requested, due_at: due, sent_at: null }, wat('2026-10-13T10:00:00'))).toBe('on_track');
    expect(shortlistState({ requested_at: requested, due_at: due, sent_at: null }, wat('2026-10-14T12:00:00'))).toBe('due_soon');
    expect(shortlistState({ requested_at: requested, due_at: due, sent_at: null }, wat('2026-10-15T10:01:00'))).toBe('overdue');
    expect(shortlistState({ requested_at: requested, due_at: due, sent_at: wat('2026-10-14T09:00:00') }, wat('2026-10-20T10:00:00'))).toBe('sent');
  });
  it('ignores a shortlist sent before a newer request', () => {
    expect(shortlistState({ requested_at: requested, due_at: due, sent_at: wat('2026-10-01T09:00:00') }, wat('2026-10-13T10:00:00'))).toBe('on_track');
  });
  it('says how long is left, or how late it is', () => {
    expect(timeLeft(due, wat('2026-10-13T06:00:00'))).toBe('2 days 4 hours left');
    expect(timeLeft(due, wat('2026-10-15T05:00:00'))).toBe('5 hours left');
    expect(timeLeft(due, wat('2026-10-15T13:00:00'))).toBe('3 hours late');
    expect(timeLeft(due, wat('2026-10-15T09:59:30'))).toBe('1 minute left');
  });
});

describe('invoices', () => {
  it('works out a percentage fee with VAT in whole naira', () => {
    expect(invoiceTotals({ fee_type: 'percent', fee_percent: 10, annual_pay: 3_000_000, vat_percent: 7.5 })).toEqual({ subtotal: 300_000, vat: 22_500, total: 322_500 });
    expect(invoiceTotals({ fee_type: 'percent', fee_percent: 12.5, annual_pay: 1_234_567 })).toEqual({ subtotal: 154_321, vat: 0, total: 154_321 });
  });
  it('takes a flat fee as given', () => {
    expect(invoiceTotals({ fee_type: 'flat', flat: 150_000 })).toEqual({ subtotal: 150_000, vat: 0, total: 150_000 });
  });
  it('refuses terms the database would refuse', () => {
    expect(invoiceTotals({ fee_type: 'percent', fee_percent: 60, annual_pay: 1_000_000 })).toBeNull();
    expect(invoiceTotals({ fee_type: 'percent', fee_percent: 10, annual_pay: null })).toBeNull();
    expect(invoiceTotals({ fee_type: 'flat', flat: 0 })).toBeNull();
    expect(invoiceTotals({ fee_type: 'flat', flat: 100, vat_percent: 25 })).toBeNull();
  });
  it('shows naira, spots overdue invoices and estimates the first year from a monthly range', () => {
    expect(naira(322500)).toBe('₦322,500');
    expect(invoiceOverdue({ status: 'issued', due_on: '2026-10-01' }, '2026-10-02')).toBe(true);
    expect(invoiceOverdue({ status: 'paid', due_on: '2026-10-01' }, '2026-10-02')).toBe(false);
    expect(invoiceOverdue({ status: 'issued', due_on: '2026-10-02' }, '2026-10-02')).toBe(false);
    expect(annualPayFromRange(200_000, 300_000)).toBe(3_000_000);
    expect(annualPayFromRange(250_000, null)).toBe(3_000_000);
    expect(annualPayFromRange(null, null)).toBeNull();
  });
});

describe('job alerts', () => {
  it('go out between 07:00 and 21:00 West Africa Time', () => {
    expect(alertHours(wat('2026-10-12T06:59:00'))).toBe(false);
    expect(alertHours(wat('2026-10-12T07:00:00'))).toBe(true);
    expect(alertHours(wat('2026-10-12T20:59:00'))).toBe(true);
    expect(alertHours(wat('2026-10-12T21:00:00'))).toBe(false);
  });
});
