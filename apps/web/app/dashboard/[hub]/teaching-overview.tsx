import Link from 'next/link';
import { ArrowRight, CalendarDays, ClipboardCheck, MonitorPlay, UserRoundX } from 'lucide-react';
import { withUser, type Tenant } from '@talentral/db';
import { pickSurvey } from '@talentral/domain';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { KpiTile, Meter } from '@/components/dashboard-charts';
import { NpsPrompt } from '@/components/nps-prompt';
import { formatDate } from '@/lib/format';
import { mySurveys } from '@/lib/nps';

type CohortRow = { id: string; name: string; status: 'planned' | 'running' | 'completed'; starts_on: string | null; ends_on: string | null; programme: string; learners: number; attendance: string | null; to_grade: number };
type ClassRow = { id: string; title: string; starts_at: Date; ends_at: Date; mode: string; cohort: string; cohort_id: string; confirmed: boolean };

const TZ = { timeZone: 'Africa/Lagos' } as const;
const when = (d: Date) => new Intl.DateTimeFormat('en-GB', { ...TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v)}%`);
const COHORT_TONE = { planned: 'neutral', running: 'blue', completed: 'teal' } as const;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-NG')} ${n === 1 ? one : many}`;

// The facilitator's home: the classes they are about to teach, the registers still open, the work
// waiting for a grade and how each cohort is going. Nothing about applicants or selection.
export async function TeachingOverview({ hub, userId }: { hub: Tenant; userId: string }) {
  const slug = hub.slug;
  const data = await withUser(userId, async (tx) => ({
    cohorts: await tx<CohortRow[]>`
      select c.id, c.name, c.status, c.starts_on::text, c.ends_on::text, p.title as programme,
        count(e.id) filter (where e.status <> 'dropped')::int as learners,
        (select round(100.0 * count(*) filter (where at.status in ('present', 'late')) / nullif(count(*) filter (where at.status <> 'excused'), 0), 1)
           from public.attendance at join public.class_sessions s on s.id = at.session_id where s.cohort_id = c.id and s.starts_at <= now())::text as attendance,
        (select count(*)::int from public.submissions sb join public.enrolments se on se.id = sb.enrolment_id where se.cohort_id = c.id and sb.status = 'submitted') as to_grade
      from public.cohorts c join public.programmes p on p.id = c.programme_id left join public.enrolments e on e.cohort_id = c.id
      where c.tenant_id = ${hub.id} and c.status <> 'completed'
      group by c.id, p.title order by (c.status = 'running') desc, c.starts_on nulls last limit 8`,
    classes: await tx<ClassRow[]>`
      select s.id, s.title, s.starts_at, s.ends_at, s.mode, c.name as cohort, c.id as cohort_id, s.attendance_confirmed_at is not null as confirmed
      from public.class_sessions s join public.cohorts c on c.id = s.cohort_id
      where s.tenant_id = ${hub.id} and s.ends_at > now() - interval '2 days' and s.starts_at < now() + interval '7 days'
      order by s.starts_at limit 8`,
    grading: (await tx<{ n: number; oldest: Date | null }[]>`
      select count(*)::int as n, min(submitted_at) as oldest from public.submissions where tenant_id = ${hub.id} and status = 'submitted'`)[0]!,
    quiet: (await tx<{ n: number }[]>`
      select count(distinct enrolment_id)::int as n from public.nudges where tenant_id = ${hub.id} and step = 'team' and created_at > now() - interval '7 days'`)[0]?.n ?? 0,
    survey: pickSurvey(await mySurveys(tx), 'staff', new Date(), hub.id),
  }));

  const running = data.cohorts.filter((c) => c.status === 'running');
  const learners = running.reduce((t, c) => t + c.learners, 0);
  const rates = running.map((c) => (c.attendance === null ? null : Number(c.attendance))).filter((v): v is number => v !== null);
  const attendance = rates.length ? rates.reduce((t, v) => t + v, 0) / rates.length : null;
  const now = Date.now();
  const upcoming = data.classes.filter((c) => new Date(c.ends_at).getTime() > now);
  const openRegisters = data.classes.filter((c) => new Date(c.ends_at).getTime() <= now && !c.confirmed);
  const waitedDays = data.grading.oldest ? Math.floor((now - new Date(data.grading.oldest).getTime()) / 86_400_000) : 0;
  const today = new Intl.DateTimeFormat('en-GB', { ...TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const short = (d: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

  return (
    <div className="space-y-6">
      <PageHeader label={hub.name} title="Your teaching" description={today} />
      {data.survey && <NpsPrompt tenantId={hub.id} cohortId={null} audience="staff" hubName={hub.name} />}

      {data.cohorts.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No cohorts to teach yet">When your hub admins start a cohort, its classes, registers and work to grade appear here.</EmptyState>
      ) : (
        <>
          <Card className="overflow-hidden" role="region" aria-label="Key figures">
            <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
              <KpiTile label="Cohorts running" value={running.length} hint={data.cohorts.length > running.length ? `${data.cohorts.length - running.length} planned` : 'None planned'} />
              <KpiTile label="Learners" value={learners.toLocaleString('en-NG')} hint="In running cohorts" />
              <KpiTile label="Attendance" value={pct(attendance)} hint="Present or late, all classes so far" />
              <KpiTile label="Work to grade" value={data.grading.n.toLocaleString('en-NG')} hint={data.grading.n ? (waitedDays >= 1 ? `Oldest waiting ${plural(waitedDays, 'day')}` : 'Handed in today') : 'All caught up'} accent="teal" />
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5 sm:p-6 lg:col-span-2" role="region" aria-labelledby="classes">
              <div className="flex items-center justify-between gap-3">
                <h2 id="classes" className="text-base font-semibold">Classes this week</h2>
                <Link href={`/dashboard/${slug}/cohorts`} className="inline-flex items-center gap-1 text-sm font-medium text-blue hover:underline">All cohorts<ArrowRight className="size-3.5" aria-hidden /></Link>
              </div>
              {upcoming.length === 0 ? (
                <p className="mt-4 text-sm text-muted">No classes in the next seven days.</p>
              ) : (
                <ul className="mt-4 divide-y divide-line text-sm">
                  {upcoming.map((c) => {
                    const live = new Date(c.starts_at).getTime() <= now;
                    return (
                      <li key={c.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue" aria-hidden>{c.mode === 'online' ? <MonitorPlay className="size-4" strokeWidth={1.75} /> : <CalendarDays className="size-4" strokeWidth={1.75} />}</span>
                        <span className="min-w-0 flex-1">
                          <Link href={`/dashboard/${slug}/cohorts/${c.cohort_id}/sessions/${c.id}`} className="block truncate font-medium text-ink hover:text-blue">{c.title}</Link>
                          <span className="block truncate text-muted">{when(c.starts_at)} · {c.cohort}</span>
                        </span>
                        {live ? <Badge tone="teal">On now</Badge> : null}
                        <Link href={`/dashboard/${slug}/cohorts/${c.cohort_id}/sessions/${c.id}`} className="shrink-0 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-2 hover:bg-hover">Register</Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card className="p-5 sm:p-6" role="region" aria-labelledby="needs">
              <h2 id="needs" className="text-base font-semibold">Needs you</h2>
              <ul className="mt-4 divide-y divide-line text-sm">
                <li className="flex gap-3 py-3 first:pt-0">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue" aria-hidden><ClipboardCheck className="size-4" strokeWidth={1.75} /></span>
                  <span className="min-w-0">
                    <Link href={`/dashboard/${slug}/grading`} className="block font-medium text-ink hover:text-blue">{data.grading.n ? `${plural(data.grading.n, 'piece')} of work to grade` : 'Nothing waiting to be graded'}</Link>
                    <span className="block text-muted">Assignments handed in by learners</span>
                  </span>
                </li>
                {openRegisters.map((c) => (
                  <li key={c.id} className="flex gap-3 py-3">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-800" aria-hidden><CalendarDays className="size-4" strokeWidth={1.75} /></span>
                    <span className="min-w-0">
                      <Link href={`/dashboard/${slug}/cohorts/${c.cohort_id}/sessions/${c.id}`} className="block truncate font-medium text-ink hover:text-blue">Confirm the register: {c.title}</Link>
                      <span className="block truncate text-muted">{when(c.starts_at)} · {c.cohort}</span>
                    </span>
                  </li>
                ))}
                {data.quiet > 0 && (
                  <li className="flex gap-3 py-3">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-800" aria-hidden><UserRoundX className="size-4" strokeWidth={1.75} /></span>
                    <span className="min-w-0">
                      <Link href={`/dashboard/${slug}/cohorts`} className="block font-medium text-ink hover:text-blue">{plural(data.quiet, 'learner')} gone quiet</Link>
                      <span className="block text-muted">No activity after a reminder this week</span>
                    </span>
                  </li>
                )}
              </ul>
            </Card>
          </div>

          <Card className="overflow-hidden" role="region" aria-labelledby="my-cohorts">
            <div className="px-5 pb-3 pt-5 sm:px-6"><h2 id="my-cohorts" className="text-base font-semibold">Cohorts</h2></div>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Cohorts table">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-y border-line bg-canvas/70 text-xs font-medium text-muted">
                  <tr><th className="px-5 py-2.5 sm:px-6">Cohort</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Learners</th><th className="w-48 px-4 py-2.5">Attendance</th><th className="px-4 py-2.5 text-right sm:pr-6">To grade</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.cohorts.map((c) => (
                    <tr key={c.id} className="transition-colors hover:bg-canvas/60">
                      <td className="px-5 py-3.5 sm:px-6"><Link href={`/dashboard/${slug}/cohorts/${c.id}`} className="font-medium text-ink hover:text-blue">{c.name}</Link><span className="block text-xs text-muted">{c.programme}{c.starts_on ? ` · ${formatDate(c.starts_on)}${c.ends_on ? ` to ${formatDate(c.ends_on)}` : ''}` : ''}</span></td>
                      <td className="px-4 py-3.5"><Badge tone={COHORT_TONE[c.status]}>{c.status === 'running' ? (c.ends_on ? `Ends ${short(c.ends_on)}` : 'Running') : c.starts_on ? `Starts ${short(c.starts_on)}` : 'Planned'}</Badge></td>
                      <td className="px-4 py-3.5 text-right font-medium tabular-nums">{c.learners}</td>
                      <td className="px-4 py-3.5"><div className="flex items-center gap-3"><Meter value={c.attendance === null ? null : Number(c.attendance)} /><span className="w-10 shrink-0 text-right tabular-nums text-ink-2">{c.attendance === null ? '–' : pct(Number(c.attendance))}</span></div></td>
                      <td className="px-4 py-3.5 text-right tabular-nums sm:pr-6">{c.to_grade ? <Link href={`/dashboard/${slug}/grading`} className="font-medium text-blue hover:underline">{c.to_grade}</Link> : <span className="text-muted">0</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
