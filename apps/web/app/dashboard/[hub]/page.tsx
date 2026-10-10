import Link from 'next/link';
import { withUser, type Programme } from '@talentral/db';
import { availability, pickSurvey } from '@talentral/domain';
import { NpsPrompt } from '@/components/nps-prompt';
import { ArrowRight, ArrowUpRight, CalendarDays, ClipboardCheck, Megaphone, MonitorPlay, Users } from 'lucide-react';
import { Badge, Card, EmptyState, LinkButton, PageHeader, Select } from '@/components/ui';
import { AttendanceColumns, Breakdown, JourneyFunnel, KpiTile, Meter, ReadinessBar } from '@/components/dashboard-charts';
import { canManage, canSelect, hubAccess } from '@/lib/auth';
import { loadImpact } from '@/lib/impact-data';
import { hubUrl, liveDomain } from '@/lib/urls';
import { formatDate } from '@/lib/format';
import { mySurveys } from '@/lib/nps';
import { SetupChecklist, type SetupStep } from '@/components/setup-checklist';
import { FilterBar } from '@/components/filter-bar';
import { TeachingOverview } from './teaching-overview';

export const metadata = { title: 'Overview' };

type Count = { key: string | null; n: number };
type CohortRow = { id: string; name: string; status: 'planned' | 'running' | 'completed'; starts_on: string | null; ends_on: string | null; programme: string; learners: number; completed: number; enrolled: number; attendance: string | null };
type ClassRow = { id: string; title: string; starts_at: Date; mode: string; cohort: string; cohort_id: string };

const TZ = { timeZone: 'Africa/Lagos' } as const;
const when = (d: Date) => new Intl.DateTimeFormat('en-GB', { ...TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${Math.round(v)}%`);
const COHORT_TONE = { planned: 'neutral', running: 'blue', completed: 'teal' } as const;

// The hub's command centre: where every learner is on the way from application to work, what
// needs doing today, and how each cohort is going.
export default async function Overview({ params, searchParams }: { params: Promise<{ hub: string }>; searchParams: Promise<{ programme?: string }> }) {
  const { hub: slug } = await params;
  const { programme } = await searchParams;
  const { user, hub, role } = await hubAccess(slug);
  // Facilitators teach and take no part in selection, so they get their own home.
  if (!canSelect(role)) return <TeachingOverview hub={hub} userId={user.id} />;
  const pid = programme && /^[0-9a-f-]{36}$/.test(programme) ? programme : null;
  const data = await withUser(user.id, async (tx) => {
    const scope = pid ? tx`tenant_id = ${hub.id} and programme_id = ${pid}` : tx`tenant_id = ${hub.id}`;
    const group = (expr: string) => tx<Count[]>`select ${tx.unsafe(expr)} as key, count(*)::int as n from public.applications where ${scope} group by 1 order by 2 desc limit 6`;
    const [total] = await tx<{ n: number; week: number }[]>`select count(*)::int as n, count(*) filter (where submitted_at > now() - interval '7 days')::int as week from public.applications where ${scope}`;
    const { impact } = await loadImpact(tx, hub.id, { programme: pid ?? undefined });
    return {
      total: total?.n ?? 0, week: total?.week ?? 0, impact,
      track: await group('track'), gender: await group(`answers ->> 'gender'`), state: await group(`answers ->> 'state_of_residence'`),
      programmes: await tx<Programme[]>`select * from public.programmes where tenant_id = ${hub.id} order by created_at desc`,
      cohorts: await tx<CohortRow[]>`
        select c.id, c.name, c.status, c.starts_on::text, c.ends_on::text, p.title as programme,
          count(e.id) filter (where e.status <> 'dropped')::int as learners,
          count(e.id) filter (where e.status = 'completed')::int as completed,
          count(e.id)::int as enrolled,
          (select round(100.0 * count(*) filter (where at.status in ('present', 'late')) / nullif(count(*) filter (where at.status <> 'excused'), 0), 1)
             from public.attendance at join public.class_sessions s on s.id = at.session_id where s.cohort_id = c.id and s.starts_at <= now())::text as attendance
        from public.cohorts c join public.programmes p on p.id = c.programme_id left join public.enrolments e on e.cohort_id = c.id
        where c.tenant_id = ${hub.id} and (${pid}::uuid is null or c.programme_id = ${pid})
        group by c.id, p.title order by (c.status = 'running') desc, c.starts_on desc nulls last limit 6`,
      classes: await tx<ClassRow[]>`
        select s.id, s.title, s.starts_at, s.mode, c.name as cohort, c.id as cohort_id from public.class_sessions s join public.cohorts c on c.id = s.cohort_id
        where s.tenant_id = ${hub.id} and s.ends_at > now() and (${pid}::uuid is null or c.programme_id = ${pid}) order by s.starts_at limit 3`,
      setup: (await tx<{ team: number; courses: number; cohorts: number; bar: number | null }[]>`
        select (select count(*)::int from public.memberships m where m.tenant_id = ${hub.id}) as team,
          (select count(*)::int from public.courses c where c.tenant_id = ${hub.id}) as courses,
          (select count(*)::int from public.cohorts c where c.tenant_id = ${hub.id}) as cohorts,
          (select round(avg(min_attendance))::int from public.cohorts c where c.tenant_id = ${hub.id} and c.status <> 'completed') as bar`)[0]!,
      toGrade: (await tx<{ n: number }[]>`select count(*)::int as n from public.submissions where tenant_id = ${hub.id} and status = 'submitted'`)[0]?.n ?? 0,
      support: await tx<{ staff_email: string; reason: string; created_at: Date; expires_at: Date; ended_at: Date | null }[]>`
        select staff_email, reason, created_at, expires_at, ended_at from public.support_grants
        where tenant_id = ${hub.id} and created_at > now() - interval '90 days' order by created_at desc limit 5`,
      survey: role === 'platform' ? null : pickSurvey(await mySurveys(tx), 'staff', new Date(), hub.id),
    };
  });
  const open = data.programmes.filter((p) => availability(p) === 'open');
  const manage = canManage(role);
  const k = data.impact.kpis;
  // Completion is measured on finished cohorts only, so a running cohort does not pull it down.
  const finished = data.cohorts.filter((c) => c.status === 'completed');
  const finishedEnrolled = finished.reduce((t, c) => t + c.enrolled, 0);
  const completion = finishedEnrolled ? (finished.reduce((t, c) => t + c.completed, 0) / finishedEnrolled) * 100 : null;
  const journey = data.impact.funnel.filter((f) => f.stage !== 'Interviewed');
  const today = new Intl.DateTimeFormat('en-GB', { ...TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const steps: SetupStep[] = [
    { key: 'profile', title: 'Complete your hub profile', detail: 'Logo, tagline, description and contact email.', href: `/dashboard/${slug}/profile`, done: Boolean(hub.profile_completed_at) },
    { key: 'programme', title: 'Create a programme', detail: 'One call for applications, such as a bootcamp.', href: `/dashboard/${slug}/programmes/new`, done: data.programmes.length > 0 },
    { key: 'publish', title: 'Open applications', detail: 'Publish the programme page and share its link.', href: `/dashboard/${slug}/programmes`, done: data.programmes.some((p) => p.status !== 'draft') },
    { key: 'team', title: 'Invite your team', detail: 'Reviewers, facilitators and admins.', href: `/dashboard/${slug}/team`, done: data.setup.team > 1 },
    { key: 'course', title: 'Build a course', detail: 'Modules and lessons in English and Hausa.', href: `/dashboard/${slug}/courses/new`, done: data.setup.courses > 0 },
    { key: 'cohort', title: 'Start a cohort', detail: 'Admit accepted applicants in one click.', href: `/dashboard/${slug}/cohorts/new`, done: data.setup.cohorts > 0 },
  ];
  const short = (d: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
  const daysLeft = (d: Date | null) => (d ? Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000)) : null);

  return (
    <div className="space-y-6">
      <PageHeader label={hub.name} title="Overview" description={today}
        actions={<>
          <LinkButton variant="secondary" href={hubUrl(hub.slug, '', liveDomain(hub))} target="_blank">Public page<ArrowUpRight aria-hidden /></LinkButton>
          {manage && <LinkButton href={`/dashboard/${slug}/programmes/new`}>New programme</LinkButton>}
        </>} />
      {data.survey && <NpsPrompt tenantId={hub.id} cohortId={null} audience="staff" hubName={hub.name} />}
      {manage && <SetupChecklist steps={steps} />}

      {data.programmes.length > 1 && (
        <FilterBar collapse={false} ariaLabel="Choose a programme" className="text-sm">
          <label className="flex items-center gap-2"><span className="font-medium text-muted">Showing</span>
            <Select name="programme" defaultValue={pid ?? ''} className="h-9 w-auto max-w-xs">
              <option value="">All programmes</option>{data.programmes.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </Select>
          </label>
        </FilterBar>
      )}

      {data.programmes.length === 0 ? (
        manage ? <EmptyState icon={Megaphone} title="Create your first call for applications" action={<LinkButton href={`/dashboard/${slug}/programmes/new`}>New programme</LinkButton>}>Each programme gets its own page and application form that you can share.</EmptyState>
          : <EmptyState icon={Megaphone} title="No programmes yet">Your hub admins have not created a programme yet.</EmptyState>
      ) : (
        <>
          <Card className="overflow-hidden" role="region" aria-label="Key figures">
            <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 xl:grid-cols-6">
              <KpiTile label="Applicants" value={data.total.toLocaleString('en-NG')} hint={data.week ? `+${data.week} in the last 7 days` : 'None in the last 7 days'} />
              <KpiTile label="Learners" value={k.enrolled.toLocaleString('en-NG')} hint={k.active ? `${k.activeThisWeek} active this week` : 'No cohort running'} />
              <KpiTile label="Attendance" value={pct(k.averageAttendance)} hint="Across all classes" />
              <KpiTile label="Completion, ended cohorts" value={pct(completion)} hint={finished.length ? `${finished.reduce((t, c) => t + c.completed, 0)} of ${finishedEnrolled} learners` : 'Shown when a cohort ends'} />
              <KpiTile label="Certified" value={k.certified.toLocaleString('en-NG')} hint="Verifiable credentials" accent="teal" />
              <KpiTile label="In work" value={k.placed.toLocaleString('en-NG')} hint={k.placementRate !== null ? `${pct(k.placementRate)} of completers` : 'Placements appear here'} accent="teal" />
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5 sm:p-6 lg:col-span-2" role="region" aria-labelledby="journey">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="journey" className="text-base font-semibold">Skills-to-work journey</h2>
                  <p className="mt-0.5 text-sm text-muted">Every learner from application to paid work. Percentages show each step from the one before.</p>
                </div>
                <Link href={`/dashboard/${slug}/impact`} className="inline-flex items-center gap-1 text-sm font-medium text-blue hover:underline">Impact report<ArrowRight className="size-3.5" aria-hidden /></Link>
              </div>
              <JourneyFunnel stages={journey} />
            </Card>

            <Card className="flex flex-col p-5 sm:p-6" role="region" aria-labelledby="agenda">
              <h2 id="agenda" className="text-base font-semibold">Needs attention</h2>
              <ul className="mt-4 divide-y divide-line text-sm">
                {data.classes.map((c) => (
                  <li key={c.id} className="flex gap-3 py-3 first:pt-0">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue" aria-hidden>{c.mode === 'online' ? <MonitorPlay className="size-4" strokeWidth={1.75} /> : <CalendarDays className="size-4" strokeWidth={1.75} />}</span>
                    <span className="min-w-0">
                      <Link href={`/dashboard/${slug}/cohorts/${c.cohort_id}/sessions/${c.id}`} className="block truncate font-medium text-ink hover:text-blue">{c.title}</Link>
                      <span className="block truncate text-muted">{when(c.starts_at)} · {c.cohort}</span>
                    </span>
                  </li>
                ))}
                <li className="flex gap-3 py-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue" aria-hidden><ClipboardCheck className="size-4" strokeWidth={1.75} /></span>
                  <span className="min-w-0">
                    <Link href={`/dashboard/${slug}/grading`} className="block font-medium text-ink hover:text-blue">{data.toGrade ? `${data.toGrade} ${data.toGrade === 1 ? 'piece' : 'pieces'} of work to grade` : 'Nothing waiting to be graded'}</Link>
                    <span className="block text-muted">Assignments handed in by learners</span>
                  </span>
                </li>
                {open.slice(0, 2).map((p) => (
                  <li key={p.id} className="flex gap-3 py-3 last:pb-0">
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue" aria-hidden><Users className="size-4" strokeWidth={1.75} /></span>
                    <span className="min-w-0">
                      <Link href={`/dashboard/${slug}/programmes/${p.id}`} className="block truncate font-medium text-ink hover:text-blue">{p.title}</Link>
                      <span className="block text-muted">Open call{daysLeft(p.closes_at) !== null ? ` · closes in ${daysLeft(p.closes_at)} ${daysLeft(p.closes_at) === 1 ? 'day' : 'days'}` : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-5 sm:p-6 lg:col-span-2" role="region" aria-labelledby="attendance-trend">
              <h2 id="attendance-trend" className="text-base font-semibold">Weekly attendance</h2>
              <p className="mt-0.5 text-sm text-muted">Share of learners present or late, last 12 weeks{data.setup.bar !== null ? `, against the ${data.setup.bar}% attendance bar` : ''}.</p>
              <div className="mt-6"><AttendanceColumns weeks={data.impact.weeks} target={data.setup.bar} /></div>
            </Card>
            <Card className="p-5 sm:p-6" role="region" aria-labelledby="readiness">
              <h2 id="readiness" className="text-base font-semibold">Work readiness</h2>
              <p className="mt-0.5 mb-5 text-sm text-muted">From enrolment to verified, job-ready talent.</p>
              <ReadinessBar levels={data.impact.readiness} />
            </Card>
          </div>

          {data.cohorts.length > 0 && (
            <Card className="overflow-hidden" role="region" aria-labelledby="cohorts">
              <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
                <h2 id="cohorts" className="text-base font-semibold">Cohorts</h2>
                <Link href={`/dashboard/${slug}/cohorts`} className="inline-flex items-center gap-1 text-sm font-medium text-blue hover:underline">All cohorts<ArrowRight className="size-3.5" aria-hidden /></Link>
              </div>
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Cohorts table">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-y border-line bg-canvas/70 text-xs font-medium text-muted">
                    <tr><th className="px-5 py-2.5 sm:px-6">Cohort</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Learners</th><th className="w-44 px-4 py-2.5">Attendance</th><th className="w-44 px-4 py-2.5 sm:pr-6">Completion</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.cohorts.map((c) => {
                      const completion = c.enrolled ? (c.completed / c.enrolled) * 100 : 0;
                      return (
                        <tr key={c.id} className="transition-colors hover:bg-canvas/60">
                          <td className="px-5 py-3.5 sm:px-6"><Link href={`/dashboard/${slug}/cohorts/${c.id}`} className="font-medium text-ink hover:text-blue">{c.name}</Link><span className="block text-xs text-muted">{c.programme}{c.starts_on ? ` · ${formatDate(c.starts_on)}${c.ends_on ? ` to ${formatDate(c.ends_on)}` : ''}` : ''}</span></td>
                          <td className="px-4 py-3.5"><Badge tone={COHORT_TONE[c.status]}>{c.status === 'running' ? 'Running' : c.status === 'completed' ? 'Completed' : 'Planned'}</Badge></td>
                          <td className="px-4 py-3.5 text-right font-medium tabular-nums">{c.learners}</td>
                          <td className="px-4 py-3.5"><div className="flex items-center gap-3"><Meter value={c.attendance === null ? null : Number(c.attendance)} /><span className="w-10 shrink-0 text-right tabular-nums text-ink-2">{c.attendance === null ? '–' : pct(Number(c.attendance))}</span></div></td>
                          <td className="px-4 py-3.5 sm:pr-6"><div className="flex items-center gap-3">{c.status === 'completed' ? <Meter value={completion} tone="teal" /> : <div className="w-full" />}<span className="w-24 shrink-0 text-right tabular-nums text-ink-2">{c.status === 'completed' ? pct(completion) : c.status === 'running' ? (c.ends_on ? `Ends ${short(c.ends_on)}` : 'Running') : c.starts_on ? `Starts ${short(c.starts_on)}` : '–'}</span></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div>
            <h2 className="mb-3 text-base font-semibold">Who applies</h2>
            <div className="grid gap-4 md:grid-cols-3">
              <Breakdown title="By track" rows={data.track} total={data.total} />
              <Breakdown title="By gender" rows={data.gender} total={data.total} />
              <Breakdown title="By state of residence" rows={data.state} total={data.total} />
            </div>
          </div>
        </>
      )}
      {manage && data.support.length > 0 && (
        <Card className="p-5" role="region" aria-labelledby="support-visits">
          <h2 id="support-visits" className="text-sm font-semibold text-ink">Talentral support visits</h2>
          <p className="mt-1 text-sm text-muted">When the Talentral team opens your dashboard to help, it shows here and in your audit log.</p>
          <ul className="mt-3 divide-y divide-line text-sm">
            {data.support.map((v, i) => {
              const live = !v.ended_at && new Date(v.expires_at).getTime() > Date.now();
              return (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                  <span className="min-w-0"><span className="font-medium">{v.staff_email}</span><span className="block text-muted">{v.reason}</span></span>
                  <span className="text-xs text-muted">{formatDate(v.created_at, true)}{live ? <b className="ml-1 font-medium text-amber-800">· active now</b> : ''}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
