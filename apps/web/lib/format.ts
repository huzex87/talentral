// All dates are shown in West Africa Time.
const TZ = 'Africa/Lagos';

export function formatDate(d: Date | string | null | undefined, withTime = false): string {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ,
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(d));
}

// Value for <input type="datetime-local"> in WAT (UTC+1, no daylight saving).
export function toLocalInput(d: Date | string | null | undefined): string {
  if (!d) return '';
  const wat = new Date(new Date(d).getTime() + 60 * 60 * 1000);
  return wat.toISOString().slice(0, 16);
}

// Parses a datetime-local value entered in WAT.
export function fromLocalInput(v: string): Date | null {
  if (!v) return null;
  const d = new Date(`${v}:00+01:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
