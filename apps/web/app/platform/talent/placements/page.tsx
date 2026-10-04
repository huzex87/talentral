import Link from 'next/link';
import { withUser } from '@talentral/db';
import {
  CONFIRMATION_LABELS, JOB_TYPES, RETENTION_LABELS, RETENTION_OFFICER_DAYS, confirmationOf, retentionDueOn, retentionState, watToday,
  type RetentionState,
} from '@talentral/domain';
import { Badge, Card, EmptyState, PageHeader, cx } from '@/components/ui';
import { requirePlatformAdmin } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { OfficerConfirmForm, OfficerRetentionForm } from '../forms';
import { Stat, TalentShell } from '../shell';

export const metadata = { title: 'Placements' };

type Placement = {
  id: string; user_id: string; person: string; role_id: string; role: string; employer_id: string; employer: string; has_team: boolean;
  placement_type: keyof typeof JOB_TYPES | null; start_date: string; pay_band: string | null;
  placement_confirmed_at: Date | null; placement_confirmation: 'employer' | 'officer' | null; placement_note: string | null;
  retained: boolean | null; retention_checked_at: Date | null; retention_source: 'employer' | 'officer' | null; retention_note: string | null;
  retention_asked_at: Date | null; retention_reminded_at: Date | null;
};

const FILTERS = [
  ['all', 'All'],
  ['confirm', 'Waiting for confirmation'],
  ['due', '90-day check due'],
  ['overdue', 'Follow up'],
] as const;
type Filter = (typeof FILTERS)[number][0];

const RETENTION_TONE: Record<RetentionState, 'neutral' | 'amber' | 'teal' | 'danger' | 'blue'> = { not_due: 'neutral', due: 'amber', overdue: 'danger', retained: 'teal', left: 'neutral' };

export default async function Placements({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requirePlatformAdmin();
  const sp = await searchParams;
  const show = (FILTERS.find(([k]) => k === sp.show)?.[0] ?? 'all') as Filter;
  const rows = await withUser(user.id, (tx) => tx<Placement[]>`
    select c.id, c.user_id, coalesce(u.full_name, u.email::text) as person, r.id as role_id, r.title as role, e.id as employer_id, e.name as employer,
      exists (select 1 from public.employer_members m where m.employer_id = e.id) as has_team,
      c.placement_type, c.start_date::text as start_date, c.pay_band, c.placement_confirmed_at, c.placement_confirmation, c.placement_note,
      c.retained, c.retention_checked_at, c.retention_source, c.retention_note, c.retention_asked_at, c.retention_reminded_at
    from public.role_candidates c join public.job_roles r on r.id = c.role_id join public.employers e on e.id = r.employer_id join public.users u on u.id = c.user_id
    where c.stage = 'placed' order by c.start_date desc, c.id`);
  const today = watToday(new Date());
  const all = rows.map((p) => ({ p, confirmation: confirmationOf(p), retention: retentionState(p, today) }));
  const shown = all.filter((x) => show === 'all' || (show === 'confirm' && x.confirmation === 'awaiting')
    || (show === 'due' && x.retention === 'due') || (show === 'overdue' && x.retention === 'overdue'));
  const answered = all.filter((x) => x.p.retained !== null);
  const retainedRate = answered.length ? Math.round((answered.filter((x) => x.p.retained).length / answered.length) * 100) : null;
  const counts: Record<Filter, number> = {
    all: all.length,
    confirm: all.filter((x) => x.confirmation === 'awaiting').length,
    due: all.filter((x) => x.retention === 'due').length,
    overdue: all.filter((x) => x.retention === 'overdue').length,
  };

  return (
    <TalentShell user={user} active="placements">
      <PageHeader label="Talent console" title="Placements"
        description={`Every hire recorded on Talentral, who confirmed it, and its 90-day retention check. Employers are asked by email when the check opens and reminded a week later; after ${RETENTION_OFFICER_DAYS} days without an answer, follow up and record it here.`}
        actions={<Link href="/platform/outcomes" className="text-sm font-semibold text-blue hover:underline">Gate G3: pilot outcomes →</Link>} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Placements" value={all.length} tone="teal" />
        <Stat label="Employer-confirmed" value={all.filter((x) => x.confirmation !== 'awaiting').length} tone="blue" />
        <Stat label="Checks to chase" value={counts.overdue} tone="violet" />
        <Stat label="Still in the job at 90 days" value={retainedRate === null ? '–' : `${retainedRate}%`} />
      </div>

      <nav aria-label="Filter placements" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(([key, label]) => (
          <Link key={key} href={key === 'all' ? '/platform/talent/placements' : `/platform/talent/placements?show=${key}`} aria-current={show === key ? 'page' : undefined}
            className={cx('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition',
              show === key ? 'border-blue bg-blue-50 text-blue' : 'border-line bg-white text-muted hover:text-ink')}>
            {label}<span className="tabular-nums text-xs">{counts[key]}</span>
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <EmptyState title={show === 'all' ? 'No placements yet' : 'Nothing here'}>
          {show === 'all' ? 'Hires appear here when an employer records one, or when you record a placement on a role.' : 'Nothing needs attention in this list.'}
        </EmptyState>
      ) : (
        <ul className="space-y-3" aria-label="Placements">
          {shown.map(({ p, confirmation, retention }) => (
            <li key={p.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/platform/talent/people/${p.user_id}`} className="font-display text-lg font-semibold hover:text-blue">{p.person}</Link>
                    <p className="text-sm text-muted">
                      <Link href={`/platform/talent/roles/${p.role_id}`} className="hover:underline">{p.role}</Link> at{' '}
                      <Link href={`/platform/talent/employers/${p.employer_id}`} className="hover:underline">{p.employer}</Link>
                      {p.placement_type ? ` · ${JOB_TYPES[p.placement_type]}` : ''}{p.pay_band ? ` · ${p.pay_band}` : ''}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">Started {formatDate(p.start_date)} · 90-day check {formatDate(retentionDueOn(p.start_date))}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={confirmation === 'awaiting' ? 'amber' : 'teal'}>{confirmation === 'awaiting' ? 'Not confirmed' : 'Confirmed'}</Badge>
                    <Badge tone={RETENTION_TONE[retention]}>{RETENTION_LABELS[retention]}</Badge>
                  </div>
                </div>

                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-[13px] font-medium text-muted">Hire</dt>
                    <dd className="mt-0.5">{CONFIRMATION_LABELS[confirmation]}{p.placement_confirmed_at ? ` on ${formatDate(p.placement_confirmed_at)}` : ''}{p.placement_note ? `: “${p.placement_note}”` : ''}</dd>
                  </div>
                  <div>
                    <dt className="text-[13px] font-medium text-muted">90-day check</dt>
                    <dd className="mt-0.5">
                      {p.retained !== null
                        ? <>{RETENTION_LABELS[retention]}, recorded by {p.retention_source === 'officer' ? 'Talentral' : 'the employer'} on {formatDate(p.retention_checked_at)}{p.retention_note ? `: “${p.retention_note}”` : ''}</>
                        : retention === 'not_due' ? 'Opens on the date above.'
                          : <>Employer asked {p.retention_asked_at ? formatDate(p.retention_asked_at) : 'soon'}{p.retention_reminded_at ? `, reminded ${formatDate(p.retention_reminded_at)}` : ''}.</>}
                    </dd>
                  </div>
                </dl>

                {confirmation === 'awaiting' && (
                  <div className="mt-4 rounded-xl border border-line bg-canvas/50 p-3">
                    <p className="mb-2 text-sm">{p.has_team ? 'The employer was emailed to confirm this hire. If they confirmed another way, record how.' : 'This employer has no Talentral account. Confirm the hire with them, then record how.'}</p>
                    <OfficerConfirmForm id={p.id} name={p.person} />
                  </div>
                )}
                {(retention === 'due' || retention === 'overdue') && (
                  <div className={cx('mt-4 rounded-xl border p-3', retention === 'overdue' ? 'border-danger/20 bg-danger-50/40' : 'border-line bg-canvas/50')}>
                    <p className="mb-2 text-sm">{retention === 'overdue' ? 'The employer has not answered. Call them or the learner, then record what you learn.' : 'Waiting for the employer. You can record it now if you already know.'}</p>
                    <OfficerRetentionForm id={p.id} name={p.person} />
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </TalentShell>
  );
}
