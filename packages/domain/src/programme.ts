// Whether a programme is accepting applications at a given moment.
export type ProgrammeStatus = 'draft' | 'open' | 'closed';

export interface ProgrammeWindow {
  status: ProgrammeStatus;
  opens_at: Date | string | null;
  closes_at: Date | string | null;
}

export type Availability = 'draft' | 'not_yet_open' | 'open' | 'closed';

export function availability(p: ProgrammeWindow, now = new Date()): Availability {
  if (p.status === 'draft') return 'draft';
  if (p.status === 'closed') return 'closed';
  if (p.opens_at && new Date(p.opens_at) > now) return 'not_yet_open';
  if (p.closes_at && new Date(p.closes_at) <= now) return 'closed';
  return 'open';
}
