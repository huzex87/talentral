import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { attendanceRate, buildCohortReport, type CohortLearner, type Mark, type Split } from '@talentral/domain';
import { Card, LinkButton } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { logoUrl } from '@/lib/hubs';
import { PrintButton } from '../../../reports/print-button';
import { MODE_LABELS } from '../../labels';

export const metadata = { title: 'Cohort completion report' };

const pct = (v: number | null) => (v === null ? '–' : `${v}%`);
const share = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–');

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="break-inside-avoid rounded-[var(--radius-control)] border border-line bg-white p-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  );
}

function Table({ title, rows }: { title: string; rows: Split[] }) {
  if (!rows.length) return null;
  return (
    <div className="break-inside-avoid">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-[0.12em] text-muted">{title}</h3>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs text-muted"><tr><th className="py-1.5 font-semibold"> </th><th className="py-1.5 text-right font-semibold">Enrolled</th><th className="py-1.5 text-right font-semibold">Completed</th><th className="py-1.5 text-right font-semibold">Completion</th></tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => <tr key={r.key}><td className="py-1.5">{r.key}</td><td className="py-1.5 text-right tabular-nums">{r.enrolled}</td><td className="py-1.5 text-right font-semibold tabular-nums">{r.completed}</td><td className="py-1.5 text-right tabular-nums text-muted">{share(r.completed, r.enrolled)}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="flex items-baseline gap-3 border-b border-line pb-2 text-xl font-semibold"><span className="text-violet">{n}.</span>{title}</h2>
      {children}
    </section>
  );
}

type Row = { status: CohortLearner['status']; track: string | null; source: CohortLearner['source']; answers: Record<string, unknown>; marks: Mark[] | null };
type Session = { title: string; starts_at: Date; mode: keyof typeof MODE_LABELS; facilitator: string | null; attended: number; marked: number };

export default async function CohortReport({ params }: { params: Promise<{ hub: string; id: string }> }) {
  const { hub: slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const data = await withUser(user.id, async (tx) => {
    const [c] = await tx<{ name: string; starts_on: string | null; ends_on: string | null; min_attendance: number; programme: string; status: string }[]>`
      select c.name, c.starts_on::text, c.ends_on::text, c.min_attendance, c.status, p.title as programme
      from public.cohorts c join public.programmes p on p.id = c.programme_id where c.id = ${id} and c.tenant_id = ${hub.id}`;
    if (!c) return null;
    const sessions = await tx<Session[]>`
      select s.title, s.starts_at, s.mode, s.facilitator,
        (select count(*)::int from public.attendance a where a.session_id = s.id and a.status in ('present', 'late')) as attended,
        (select count(*)::int from public.attendance a where a.session_id = s.id) as marked
      from public.class_sessions s where s.cohort_id = ${id} and s.starts_at <= now() order by s.starts_at`;
    const rows = await tx<Row[]>`
      select e.status, a.track, a.source, a.answers,
        (select array_agg(at.status) from public.attendance at join public.class_sessions s on s.id = at.session_id where at.enrolment_id = e.id and s.starts_at <= now()) as marks
      from public.enrolments e join public.applications a on a.id = e.application_id where e.cohort_id = ${id}`;
    const [outcomes] = await tx<{ put_forward: string; interviewed: string; placed: string }[]>`select * from app.cohort_outcomes(${id})`;
    return { c, sessions, rows, outcomes };
  });
  if (!data) notFound();
  const { c, sessions, rows, outcomes } = data;
  const placed = Number(outcomes?.placed ?? 0);
  const learners: CohortLearner[] = rows.map((r) => ({ status: r.status, track: r.track, source: r.source, answers: r.answers, rate: attendanceRate(r.marks ?? [], sessions.length) }));
  const rep = buildCohortReport(learners, c.starts_on ? new Date(c.starts_on) : new Date());
  const t = rep.totals;
  const logo = logoUrl(hub);

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/dashboard/${slug}/cohorts/${id}`} className="text-sm font-semibold text-blue hover:underline">← {c.name}</Link>
        <PrintButton />
      </div>

      <article className="space-y-10 rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-10 print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b-4 border-double border-line pb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">Milestone report · Cohort completion</p>
            <h1 className="mt-2 font-display text-3xl font-semibold leading-tight">{c.programme}: {c.name}</h1>
            <p className="mt-2 text-[15px] text-muted">{hub.name}{hub.state ? `, ${hub.state} State` : ''}</p>
            <dl className="mt-4 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
              <div><dt className="inline text-muted">Cohort dates: </dt><dd className="inline">{c.starts_on ? `${formatDate(c.starts_on)} to ${c.ends_on ? formatDate(c.ends_on) : 'ongoing'}` : 'Not set'}</dd></div>
              <div><dt className="inline text-muted">Completion rule: </dt><dd className="inline">at least {c.min_attendance}% attendance, confirmed by the hub</dd></div>
              <div><dt className="inline text-muted">Report generated: </dt><dd className="inline">{formatDate(new Date(), true)} (WAT)</dd></div>
              <div><dt className="inline text-muted">Cohort status: </dt><dd className="inline capitalize">{c.status}</dd></div>
            </dl>
          </div>
          {logo && <img src={logo} alt={`${hub.name} logo`} className="h-16 w-auto max-w-40 object-contain" />}
        </header>

        <Section n={1} title="Summary">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Enrolled" value={t.enrolled} note={t.imported ? `${t.imported} selected on an external platform` : undefined} />
            <Stat label="Completed" value={t.completed} />
            <Stat label="Completion rate" value={pct(rep.rates.completion)} />
            <Stat label="Retention" value={pct(rep.rates.retention)} note={`${t.dropped} dropped out`} />
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Sessions delivered" value={sessions.length} />
            <Stat label="Average attendance" value={pct(rep.rates.averageAttendance)} />
            <Stat label="Women among completers" value={pct(rep.rates.womenCompleted)} />
            <Stat label="Youth (18 to 35) among completers" value={pct(rep.rates.youthCompleted)} />
          </div>
          {Number(outcomes?.put_forward ?? 0) > 0 && (
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Put forward to employers" value={Number(outcomes!.put_forward)} note="through the Talentral talent team" />
              <Stat label="Interviewed" value={Number(outcomes!.interviewed)} />
              <Stat label="Placed in work" value={placed} />
              <Stat label="Placement rate" value={share(placed, t.completed)} note="of those who completed" />
            </div>
          )}
        </Section>

        <Section n={2} title="Attendance">
          <div className="space-y-2">
            {rep.attendanceBands.map((b) => (
              <div key={b.band} className="grid grid-cols-[120px_minmax(0,1fr)_40px] items-center gap-3 text-sm">
                <span>{b.band}</span>
                <div className="h-3 rounded-full bg-canvas"><div className="h-3 rounded-full bg-teal print:bg-ink" style={{ width: `${Math.max(2, (b.n / Math.max(t.enrolled, 1)) * 100)}%` }} /></div>
                <span className="text-right font-semibold tabular-nums">{b.n}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">Share of sessions each learner attended (present or late). Excused absences are left out; sessions without a mark count as absent.</p>
        </Section>

        <Section n={3} title="Who completed">
          <div className="grid gap-8 md:grid-cols-2">
            <Table title="Gender" rows={rep.breakdowns.gender} />
            <Table title="Age" rows={rep.breakdowns.age} />
            <Table title="Track" rows={rep.breakdowns.track} />
            <Table title="Disability" rows={rep.breakdowns.disability} />
            <Table title="State of residence" rows={rep.breakdowns.state.slice(0, 12)} />
          </div>
        </Section>

        <Section n={4} title="Sessions delivered">
          {sessions.length === 0 ? <p className="text-sm text-muted">No sessions held yet.</p> : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs text-muted"><tr><th className="py-1.5 font-semibold">Date</th><th className="py-1.5 font-semibold">Session</th><th className="py-1.5 font-semibold">Format</th><th className="py-1.5 text-right font-semibold">Attended</th></tr></thead>
              <tbody className="divide-y divide-line">
                {sessions.map((s, i) => (
                  <tr key={i} className="break-inside-avoid">
                    <td className="py-1.5 whitespace-nowrap pr-3">{formatDate(s.starts_at)}</td>
                    <td className="py-1.5 pr-3">{s.title}{s.facilitator && <span className="text-muted"> · {s.facilitator}</span>}</td>
                    <td className="py-1.5 pr-3">{MODE_LABELS[s.mode]}</td>
                    <td className="py-1.5 text-right tabular-nums">{s.attended} of {t.enrolled - t.dropped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <footer className="border-t border-line pt-4 text-xs text-muted">
          Prepared with Talentral from attendance taken at each session (facilitator registers and learner check-ins with a session code) and completion confirmed by the hub. Every change is logged with who made it and when.
          Personal data is processed under the Nigeria Data Protection Act 2023.
        </footer>
      </article>

      <Card className="mt-6 p-5 print:hidden">
        <h2 className="font-semibold">Named lists</h2>
        <p className="mt-1 text-sm text-muted">For funders who need the list of completers, export accepted participants from the applications list; each learner's attendance is on the cohort page.</p>
        <div className="mt-3"><LinkButton size="sm" variant="secondary" href={`/dashboard/${slug}/cohorts/${id}`}>Open the cohort</LinkButton></div>
      </Card>
    </div>
  );
}
