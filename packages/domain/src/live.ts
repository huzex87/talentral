// Class reminders: when each one is due, and the quiet hours they respect.

const WAT_OFFSET_MS = 60 * 60 * 1000; // West Africa Time is UTC+1 all year

// 21:00 to 07:00 WAT: no non-urgent messages.
export function inQuietHours(now: Date): boolean {
  const hour = new Date(now.getTime() + WAT_OFFSET_MS).getUTCHours();
  return hour >= 21 || hour < 7;
}

export type ReminderKind = 'day' | 'soon';

// The day-before reminder goes out between 26 and 2 hours before the start, outside quiet hours
// (so a 9am class is reminded the previous evening, not at 3am). The "starting soon" reminder goes
// out in the 40 minutes before the start, at any hour, because it is time-critical.
export function reminderDue(kind: ReminderKind, startsAt: Date, now: Date): boolean {
  const ms = startsAt.getTime() - now.getTime();
  if (kind === 'soon') return ms > 0 && ms <= 40 * 60_000;
  return ms > 2 * 3600_000 && ms <= 26 * 3600_000 && !inQuietHours(now);
}

export function watTime(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(d);
}
