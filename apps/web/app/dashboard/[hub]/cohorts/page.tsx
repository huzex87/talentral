import Link from 'next/link';
import { withUser } from '@talentral/db';
import { Badge, Card, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { canManage, hubAccess } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { COHORT_STATUS, COHORT_TONE } from './labels';
import { Plus, Users } from 'lucide-react';

export const metadata = { title: 'Cohorts' };

type Row = { id: string; name: string; status: 'planned' | 'running' | 'completed'; starts_on: string | null; ends_on: string | null; programme: string;
  learners: number; completed: number; sessions: number; held: number; attendance: string | null };

const short = (d: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
// One line that matters for each stage: when it starts, when it ends, or how it finished.
function cohortFooter(c: Row) {
  if (c.status === 'completed') return `${c.completed} of ${c.learners} completed`;
  if (c.status === 'running') return c.ends_on ? `Ends ${short(c.ends_on)}` : 'Running, no end date set';
  return c.starts_on ? `Starts ${short(c.starts_on)}` : 'Dates not set yet';
}

export default async function Cohorts({ params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const { user, hub, role } = await hubAccess(slug);
  const manage = canManage(role);
  const { cohorts, programmes } = await withUser(user.id, async (tx) => ({
    cohorts: await tx<Row[]>`
      select c.id, c.name, c.status, c.starts_on::text, c.ends_on::text, p.title as programme,
        (select count(*)::int from public.enrolments e where e.cohort_id = c.id and e.status <> 'dropped') as learners,
        (select count(*)::int from public.enrolments e where e.cohort_id = c.id and e.status = 'completed') as completed,
        (select count(*)::int from public.class_sessions s where s.cohort_id = c.id) as sessions,
        (select count(*)::int from public.class_sessions s where s.cohort_id = c.id and s.starts_at <= now()) as held,
        (select round(100.0 * count(*) filter (where a.status in ('present', 'late')) / nullif(count(*) filter (where a.status <> 'excused'), 0), 1)
           from public.attendance a join public.class_sessions s on s.id = a.session_id where s.cohort_id = c.id) as attendance
      from public.cohorts c join public.programmes p on p.id = c.programme_id
      where c.tenant_id = ${hub.id} order by c.created_at desc`,
    programmes: await tx<{ id: string; title: string; accepted: number }[]>`
      select p.id, p.title, (select count(*)::int from public.applications a where a.programme_id = p.id and a.status = 'accepted') as accepted
      from public.programmes p where p.tenant_id = ${hub.id} order by p.created_at desc`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader label="Deliver" title="Cohorts" description="Admit accepted applicants, run the timetable, take attendance and record who completed."
        actions={manage && programmes.length > 0 ? <LinkButton href={`/dashboard/${slug}/cohorts/new`}><Plus aria-hidden />New cohort</LinkButton> : undefined} />

      {cohorts.length === 0 ? (
        <EmptyState icon={Users} title="No cohorts yet" action={manage && programmes.length > 0 ? <LinkButton href={`/dashboard/${slug}/cohorts/new`}>New cohort</LinkButton> : undefined}>
          {manage ? (programmes.length ? 'Create a cohort for a programme, then add everyone you accepted in one click.' : 'Create a programme first. Cohorts are filled from its accepted applicants.') : 'Your hub admins have not created a cohort yet.'}
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cohorts.map((c) => (
            <Link key={c.id} href={`/dashboard/${slug}/cohorts/${c.id}`} className="group">
              <Card className="h-full p-5 transition group-hover:border-blue/40 group-hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-muted">{c.programme}</p>
                    <h2 className="mt-1 truncate text-xl font-semibold group-hover:text-blue">{c.name}</h2>
                    <p className="text-sm text-muted">{c.starts_on ? `${formatDate(c.starts_on)} to ${c.ends_on ? formatDate(c.ends_on) : 'open'}` : 'Dates not set'}</p>
                  </div>
                  <Badge tone={COHORT_TONE[c.status]}>{COHORT_STATUS[c.status]}</Badge>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-[var(--radius-control)] bg-canvas p-2"><dt className="text-xs text-muted">Learners</dt><dd className="font-display text-xl font-semibold">{c.learners}</dd></div>
                  <div className="rounded-[var(--radius-control)] bg-canvas p-2"><dt className="text-xs text-muted">Sessions</dt><dd className="font-display text-xl font-semibold">{c.held}/{c.sessions}</dd></div>
                  <div className="rounded-[var(--radius-control)] bg-canvas p-2"><dt className="text-xs text-muted">Attendance</dt><dd className="font-display text-xl font-semibold">{c.attendance === null ? '–' : `${Number(c.attendance)}%`}</dd></div>
                </dl>
                <p className="mt-3 text-sm text-muted">{cohortFooter(c)}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}

    </div>
  );
}
