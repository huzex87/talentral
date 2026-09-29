// Application statuses and the moves a hub team can make between them.
export const APPLICATION_STATUSES = ['submitted', 'under_review', 'shortlisted', 'offered', 'accepted', 'declined', 'rejected', 'withdrawn'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  shortlisted: 'Shortlisted',
  offered: 'Offered a place',
  accepted: 'Accepted',
  declined: 'Declined offer',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
};

const MOVES: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ['under_review', 'shortlisted', 'rejected', 'withdrawn'],
  under_review: ['shortlisted', 'rejected', 'submitted', 'withdrawn'],
  shortlisted: ['offered', 'rejected', 'under_review', 'withdrawn'],
  offered: ['accepted', 'declined', 'shortlisted', 'withdrawn'],
  accepted: ['withdrawn'],
  declined: ['offered'],
  rejected: ['under_review'],
  withdrawn: [],
};

export function nextStatuses(from: ApplicationStatus): ApplicationStatus[] {
  return MOVES[from];
}

export function canMove(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return MOVES[from].includes(to);
}
