import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { ASSESSMENT_KINDS, type AssessmentKind } from '@talentral/domain';
import { Badge, Card, LinkButton, PageHeader } from '@/components/ui';
import { canManage, hubAccess } from '@/lib/auth';
import { loadCohortLearners } from '@/lib/cohort-data';
import { formatDate } from '@/lib/format';
import { setCohortStatus } from '../actions';
import { COHORT_STATUS, COHORT_TONE, MODE_LABELS } from '../labels';
import { skillOptions } from '@/lib/skills-data';
import { CohortCoursePicker } from '../../courses/forms';
import { smsEnabled } from '@/lib/sms';
import { AnnouncementForm, CohortDatesForm, AdmitButton, IssueCertificatesButton, NewAssessmentForm, NewSessionForm } from './cohort-forms';
import { LearnersTable } from './learners-table';

export const metadata = { title: 'Cohort' };

type Cohort = { id: string; name: string; status: 'planned' | 'running' | 'completed'; starts_on: string | null; ends_on: string | null; min_attendance: number; pass_mark: number; programme: string; programme_id: string; waiting: number };
type Session = { id: string; title: string; starts_at: Date; ends_at: Date; mode: keyof typeof MODE_LABELS; location: string | null; facilitator: string | null; checkin_open: boolean; marked: number; attended: number };

export default async function CohortPage({ params }: { params: Promise<{ hub: string; id: string }> }) {
  const { hub: slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user, hub, role } = await hubAccess(slug);
  const manage = canManage(role);

  const data = await withUser(user.id, async (tx) => {
    const [c] = await tx<Cohort[]>`
      select c.id, c.name, c.status, c.starts_on::text, c.ends_on::text, c.min_attendance, c.pass_mark, p.title as programme, p.id as programme_id,
        (select count(*)::int from public.applications a where a.programme_id = c.programme_id and a.status = 'accepted'
           and not exists (select 1 from public.enrolments e where e.application_id = a.id)) as waiting
      from public.cohorts c join public.programmes p on p.id = c.programme_id where c.id = ${id} and c.tenant_id = ${hub.id}`;
    if (!c) return null;
    const sessions = await tx<Session[]>`
      select s.id, s.title, s.starts_at, s.ends_at, s.mode, s.location, s.facilitator, s.checkin_open,
        (select count(*)::int from public.attendance a where a.session_id = s.id) as marked,
        (select count(*)::int from public.attendance a where a.session_id = s.id and a.status in ('present', 'late')) as attended
      from public.class_sessions s where s.cohort_id = ${id} order by s.starts_at`;
    const { held, learners } = await loadCohortLearners(tx, hub.id, c);
    const assessments = await tx<{ id: string; title: string; kind: AssessmentKind; max_score: number; weight: number; due_on: string | null; graded: number; average: string | null; skills: string[] }[]>`
      select a.id, a.title, a.kind, a.max_score, a.weight, a.due_on::text,
        coalesce((select array_agg(s.name order by s.name) from public.assessment_skills k join public.skills s on s.id = k.skill_id where k.assessment_id = a.id), '{}') as skills,
        (select count(*)::int from public.assessment_results r where r.assessment_id = a.id) as graded,
        (select round(100.0 * avg(r.score) / a.max_score, 1) from public.assessment_results r where r.assessment_id = a.id) as average
      from public.assessments a where a.cohort_id = ${id} order by a.created_at`;
    const [prog] = await tx<{ tracks: string[] }[]>`select tracks from public.programmes where id = ${c.programme_id}`;
    const skills = await skillOptions(tx, prog?.tracks ?? []);
    const courses = await tx<{ id: string; title: string; status: string }[]>`select id, title, status from public.courses where tenant_id = ${hub.id} order by updated_at desc`;
    const [followed] = await tx<{ course_id: string | null }[]>`select course_id from public.cohorts where id = ${id}`;
    const announcements = await tx<{ id: string; title: string; body: string; created_at: Date; recipients: number; emailed: number; texted: number; reads: number }[]>`
      select a.id, a.title, a.body, a.created_at, a.recipients, a.emailed, a.texted,
        (select count(*)::int from public.announcement_reads r where r.announcement_id = a.id) as reads
      from public.announcements a where a.cohort_id = ${id} order by a.created_at desc limit 10`;
    return { c, sessions, held, learners, assessments, skills, courses, courseId: followed?.course_id ?? null, announcements };
  });
  if (!data) notFound();
  const { c, sessions, held, learners, assessments, skills, courses, courseId, announcements } = data;
  const toCertify = learners.filter((l) => l.status === 'completed' && !l.certificate).length;
  const certified = learners.filter((l) => l.certificate && !l.certificate_revoked).length;
  const active = learners.filter((l) => l.status !== 'dropped');
  const now = Date.now();

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/dashboard/${slug}/cohorts`} className="text-sm font-semibold text-blue hover:underline">← All cohorts</Link>
        <div className="mt-3">
          <PageHeader label={c.programme} title={c.name}
            description={<span className="inline-flex flex-wrap items-center gap-2"><Badge tone={COHORT_TONE[c.status]}>{COHORT_STATUS[c.status]}</Badge>
              {c.starts_on ? `${formatDate(c.starts_on)} to ${c.ends_on ? formatDate(c.ends_on) : 'open'}` : 'Dates not set'} · completion needs {c.min_attendance}% attendance{assessments.length ? ` and ${c.pass_mark}% in assessments` : ''}</span>}
            actions={<>
              {manage && (['planned', 'running', 'completed'] as const).filter((s) => s !== c.status).map((s) => (
                <form key={s} action={setCohortStatus.bind(null, slug, c.id, s)}><button className="h-11 rounded-[var(--radius-control)] px-3 text-sm font-semibold text-muted hover:bg-white hover:text-ink">Mark {COHORT_STATUS[s].toLowerCase()}</button></form>
              ))}
              {manage && <LinkButton variant="secondary" href={`/dashboard/${slug}/cohorts/${c.id}/report`}>Completion report</LinkButton>}
            </>} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Learners', active.length], ['Completed', learners.filter((l) => l.status === 'completed').length], ['Sessions held', `${held} of ${sessions.length}`],
          ['Average attendance', (() => { const r = active.flatMap((l) => (l.rate === null ? [] : [l.rate])); return r.length ? `${Math.round(r.reduce((a, b) => a + b, 0) / r.length)}%` : '–'; })()]].map(([k, v]) => (
          <Card key={k as string} className="p-4"><p className="text-sm text-muted">{k}</p><p className="mt-1 font-display text-2xl font-semibold tabular-nums sm:text-3xl">{v}</p></Card>
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Learners</h2>
            <p className="text-sm text-muted">Attendance counts sessions held so far; excused absences are left out.</p>
          </div>
          {manage && <AdmitButton slug={slug} cohortId={c.id} waiting={c.waiting} />}
        </div>
        {learners.length === 0
          ? <Card className="p-6 text-center text-sm text-muted">No learners yet. {manage ? 'Accept applicants (or import participants selected elsewhere as Accepted), then add them here.' : ''}</Card>
          : <LearnersTable slug={slug} cohortId={c.id} manage={manage} min={c.min_attendance} passMark={assessments.length ? c.pass_mark : null}
              learners={learners.map((l) => ({ id: l.id, application_id: l.application_id, full_name: l.full_name, reference: l.reference, track: l.track, status: l.status,
                rate: l.rate, score: l.score.percent, graded: l.score.graded, total: l.score.total, standing: l.standing, source: l.source, certificate: l.certificate, certificate_revoked: l.certificate_revoked }))} />}
      </section>

      {manage && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Announcements</h2>
            <p className="text-sm text-muted">Tell the whole cohort something: it appears on their My learning page, and by email or SMS if you choose.</p>
          </div>
          <Card className="p-5"><AnnouncementForm slug={slug} cohortId={c.id} sms={smsEnabled()} /></Card>
          {announcements.length > 0 && (
            <Card className="divide-y divide-line">
              {announcements.map((a) => (
                <div key={a.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">{a.title}</p>
                    <span className="text-xs text-muted">{formatDate(a.created_at, true)}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted">{a.body}</p>
                  <p className="mt-1 text-xs text-muted"><b className="text-ink">{a.reads}</b> of {a.recipients} read on Talentral{a.emailed ? ` · ${a.emailed} emailed` : ''}{a.texted ? ` · ${a.texted} texted` : ''}</p>
                </div>
              ))}
            </Card>
          )}
        </section>
      )}

      {manage && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Course</h2>
            <p className="text-sm text-muted">The course these learners study online. Its quizzes and assignments are added to the assessments below automatically.</p>
          </div>
          <Card className="p-5">
            {courses.length ? <CohortCoursePicker slug={slug} cohortId={c.id} courseId={courseId} courses={courses} />
              : <p className="text-sm text-muted">No courses yet. <Link href={`/dashboard/${slug}/courses`} className="font-semibold text-blue hover:underline">Build one</Link> and choose it here.</p>}
            <div className="mt-4 border-t border-line pt-4"><CohortDatesForm slug={slug} cohortId={c.id} startsOn={c.starts_on} endsOn={c.ends_on} /></div>
          </Card>
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Assessments</h2>
          <p className="text-sm text-muted">Graded work counts towards completion once a cohort has assessments. Scores are weighted by importance.</p>
        </div>
        {assessments.length > 0 && (
          <Card className="divide-y divide-line">
            {assessments.map((a) => (
              <Link key={a.id} href={`/dashboard/${slug}/cohorts/${c.id}/assessments/${a.id}`} className="grid gap-2 px-5 py-4 transition hover:bg-canvas/60 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{a.title}</p>
                  <p className="text-sm text-muted">{ASSESSMENT_KINDS[a.kind]} · out of {a.max_score} · weight ×{a.weight}{a.due_on ? ` · due ${formatDate(a.due_on)}` : ''}</p>
                  {a.skills.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{a.skills.map((s) => <span key={s} className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet">{s}</span>)}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={a.graded >= active.length && active.length ? 'violet' : 'amber'}>{a.graded}/{active.length} graded</Badge>
                  {a.average !== null && <Badge>Average {Number(a.average)}%</Badge>}
                </div>
              </Link>
            ))}
          </Card>
        )}
        {manage && (
          <Card className="p-5 sm:p-6">
            <h3 className="mb-4 font-semibold">Add an assessment</h3>
            <NewAssessmentForm slug={slug} cohortId={c.id} passMark={c.pass_mark} skills={skills} />
          </Card>
        )}
      </section>

      {manage && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Certificates</h2>
            <p className="text-sm text-muted">Each certificate has a serial and a QR code that anyone can scan to confirm it is genuine. Learners receive theirs by email.</p>
          </div>
          <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
            <p className="text-[15px]"><b>{certified}</b> issued{toCertify ? <> · <b>{toCertify}</b> completed {toCertify === 1 ? 'learner is' : 'learners are'} waiting for one</> : ''}</p>
            <IssueCertificatesButton slug={slug} cohortId={c.id} waiting={toCertify} />
          </Card>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Timetable</h2>
        {sessions.length === 0 ? <Card className="p-6 text-center text-sm text-muted">No sessions yet.</Card> : (
          <Card className="divide-y divide-line">
            {sessions.map((s) => {
              const past = new Date(s.starts_at).getTime() <= now;
              const live = past && new Date(s.ends_at).getTime() >= now;
              return (
                <Link key={s.id} href={`/dashboard/${slug}/cohorts/${c.id}/sessions/${s.id}`} className="grid gap-2 px-5 py-4 transition hover:bg-canvas/60 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-center">
                  <div className="text-sm">
                    <p className="font-semibold">{formatDate(s.starts_at, true)}</p>
                    <p className="text-muted">{MODE_LABELS[s.mode]}{s.location ? ` · ${s.location}` : ''}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.title}</p>
                    {s.facilitator && <p className="text-sm text-muted">with {s.facilitator}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {live && <Badge tone="teal">Happening now</Badge>}
                    {s.checkin_open && <Badge tone="blue">Check-in open</Badge>}
                    {past ? <Badge tone={s.marked >= active.length && active.length ? 'violet' : 'amber'}>{s.attended} attended · {s.marked}/{active.length} marked</Badge> : <Badge>Upcoming</Badge>}
                  </div>
                </Link>
              );
            })}
          </Card>
        )}
        {manage && (
          <Card className="p-5 sm:p-6">
            <h3 className="mb-4 font-semibold">Add a session</h3>
            <NewSessionForm slug={slug} cohortId={c.id} />
          </Card>
        )}
      </section>
    </div>
  );
}
