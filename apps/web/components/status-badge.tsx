import { STATUS_LABELS, type ApplicationStatus } from '@talentral/domain';
import { Badge } from './ui';

const TONE: Record<ApplicationStatus, 'neutral' | 'blue' | 'violet' | 'teal' | 'amber' | 'danger'> = {
  submitted: 'neutral', under_review: 'blue', shortlisted: 'violet', offered: 'amber',
  accepted: 'teal', declined: 'neutral', rejected: 'danger', withdrawn: 'neutral',
};

export function StatusBadge({ status }: { status: string }) {
  const s = status as ApplicationStatus;
  return <Badge tone={TONE[s] ?? 'neutral'}>{STATUS_LABELS[s] ?? status}</Badge>;
}
