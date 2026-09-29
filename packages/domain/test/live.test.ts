import { describe, expect, it } from 'vitest';
import { inQuietHours, reminderDue } from '../src';

// Times are written in UTC; WAT is UTC+1.
const at = (iso: string) => new Date(iso);

describe('quiet hours', () => {
  it('run from 21:00 to 07:00 West Africa Time', () => {
    expect(inQuietHours(at('2026-10-01T19:59:00Z'))).toBe(false); // 20:59 WAT
    expect(inQuietHours(at('2026-10-01T20:00:00Z'))).toBe(true); // 21:00 WAT
    expect(inQuietHours(at('2026-10-02T05:59:00Z'))).toBe(true); // 06:59 WAT
    expect(inQuietHours(at('2026-10-02T06:00:00Z'))).toBe(false); // 07:00 WAT
  });
});

describe('reminders', () => {
  const start = at('2026-10-02T08:00:00Z'); // 09:00 WAT
  it('sends the day-before reminder in the evening window, never during quiet hours', () => {
    expect(reminderDue('day', start, at('2026-10-01T18:00:00Z'))).toBe(true); // 19:00 WAT the evening before
    expect(reminderDue('day', start, at('2026-10-02T02:00:00Z'))).toBe(false); // 03:00 WAT: quiet
    expect(reminderDue('day', start, at('2026-10-02T07:00:00Z'))).toBe(false); // an hour before: too late for "tomorrow"
    expect(reminderDue('day', start, at('2026-09-30T08:00:00Z'))).toBe(false); // two days before: too early
  });
  it('sends the starting-soon reminder in the last 40 minutes, at any hour', () => {
    expect(reminderDue('soon', start, at('2026-10-02T07:30:00Z'))).toBe(true);
    expect(reminderDue('soon', start, at('2026-10-02T07:00:00Z'))).toBe(false);
    expect(reminderDue('soon', start, at('2026-10-02T08:01:00Z'))).toBe(false);
    expect(reminderDue('soon', at('2026-10-02T05:30:00Z'), at('2026-10-02T05:00:00Z'))).toBe(true); // 06:30 class, 06:00 WAT
  });
});
