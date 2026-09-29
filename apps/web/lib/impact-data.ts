import 'server-only';
// Loads everything the Impact dashboard and M&E exports need for one hub, optionally narrowed to
// a programme or a cohort. Runs as the signed-in user, so Row-Level Security scopes it to the hub.
import type { Tx } from '@talentral/db';
import { READINESS, ageBand, ageOn, attendanceRate, buildImpact, learnerReadiness, type ImpactLearner, type Mark } from '@talentral/domain';

export interface ImpactFilters { programme?: string; cohort?: string }

interface DetailRow {
  id: string; status: ImpactLearner['status']; reference: string; full_name: string; email: string; phone: string; track: string | null;
  answers: Record<string, unknown>; source: 'applied' | 'imported'; programme: string; cohort: string; marks: Mark[] | null; held: number;
  recent: boolean; serial: string | null; certified: boolean; score: string | null; completed_at: Date | null; enrolled_at: Date;
}
type Outcome = { enrolment_id: string; has_passport: boolean; verified: boolean; put_forward: boolean; interviewed: boolean; placed: boolean };

const UUID = /^[0-9a-f-]{36}$/;

export async function loadImpact(tx: Tx, tenantId: string, f: ImpactFilters) {
  const programme = f.programme && UUID.test(f.programme) ? f.programme : null;
  const cohort = f.cohort && UUID.test(f.cohort) ? f.cohort : null;
  const programmes = await tx<{ id: string; title: string }[]>`select id, title from public.programmes where tenant_id = ${tenantId} order by created_at desc`;
  const cohorts = await tx<{ id: string; name: string; programme_id: string }[]>`select id, name, programme_id from public.cohorts where tenant_id = ${tenantId} order by created_at desc`;
  const cohortProgramme = cohort ? cohorts.find((c) => c.id === cohort)?.programme_id ?? null : null;
  const prog = cohortProgramme ?? programme;

  const applications = await tx<{ status: string }[]>`
    select status from public.applications where tenant_id = ${tenantId} and (${prog}::uuid is null or programme_id = ${prog})`;
  const detail = await tx<DetailRow[]>`
    select e.id, e.status, a.reference, a.full_name, a.email::text, a.phone, a.track, a.answers, a.source, p.title as programme, c.name as cohort,
      e.completed_at, e.enrolled_at,
      (select array_agg(at.status) from public.attendance at join public.class_sessions s on s.id = at.session_id
         where at.enrolment_id = e.id and s.starts_at <= now()) as marks,
      (select count(*)::int from public.class_sessions s where s.cohort_id = e.cohort_id and s.starts_at <= now()) as held,
      exists (select 1 from public.attendance at join public.class_sessions s on s.id = at.session_id
              where at.enrolment_id = e.id and at.status in ('present', 'late') and s.starts_at <= now() and s.starts_at > now() - interval '7 days') as recent,
      cert.serial, (cert.id is not null and cert.revoked_at is null) as certified, cert.score
    from public.enrolments e
    join public.applications a on a.id = e.application_id
    join public.cohorts c on c.id = e.cohort_id
    join public.programmes p on p.id = c.programme_id
    left join public.certificates cert on cert.enrolment_id = e.id
    where e.tenant_id = ${tenantId} and (${prog}::uuid is null or c.programme_id = ${prog}) and (${cohort}::uuid is null or e.cohort_id = ${cohort})
    order by p.title, c.name, a.full_name`;
  const outcomes = new Map((await tx<Outcome[]>`select * from app.enrolment_outcomes(${tenantId})`).map((o) => [o.enrolment_id, o]));
  const weeks = await tx<{ week: string; held: number; attended: number; marked: number }[]>`
    select to_char(date_trunc('week', s.starts_at at time zone 'Africa/Lagos'), 'YYYY-MM-DD') as week,
      count(distinct s.id)::int as held,
      count(at.id) filter (where at.status in ('present', 'late'))::int as attended,
      count(at.id) filter (where at.status <> 'excused')::int as marked
    from public.class_sessions s
    join public.cohorts c on c.id = s.cohort_id
    left join public.attendance at on at.session_id = s.id
    where s.tenant_id = ${tenantId} and s.starts_at <= now() and s.starts_at > now() - interval '12 weeks'
      and (${prog}::uuid is null or c.programme_id = ${prog}) and (${cohort}::uuid is null or s.cohort_id = ${cohort})
    group by 1 order by 1`;

  const learners = detail.map((d) => {
    const o = outcomes.get(d.id);
    const l: ImpactLearner = {
      status: d.status, rate: attendanceRate(d.marks ?? [], d.held), answers: d.answers, track: d.track, certified: d.certified,
      verified: Boolean(o?.verified), attendedRecently: d.recent, putForward: Boolean(o?.put_forward), interviewed: Boolean(o?.interviewed), placed: Boolean(o?.placed),
    };
    return { detail: d, learner: l, hasPassport: Boolean(o?.has_passport) };
  });
  const impact = buildImpact(applications, learners.map((l) => l.learner), weeks, new Date());
  return { impact, learners, programmes, cohorts, filters: { programme: prog, cohort } };
}

// Rows for the M&E export. Anonymised exports drop names and contact details, replace the
// reference with a stable pseudonym and give an age band instead of a date of birth.
export function exportTable(rows: Awaited<ReturnType<typeof loadImpact>>['learners'], anonymise: boolean): { header: string[]; body: (string | number | null)[][] } {
  const yesNo = (b: boolean) => (b ? 'Yes' : 'No');
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  const header = [
    ...(anonymise ? ['Learner ID'] : ['Reference', 'Full name', 'Email', 'Phone']),
    'Programme', 'Cohort', 'Track', 'Source', 'Gender', anonymise ? 'Age band' : 'Date of birth', 'State', 'LGA', 'Disability', 'Education', 'Employment status',
    'Status', 'Attendance %', 'Certificate', 'Certificate score %', 'Completed on', 'Readiness', 'Has Passport', 'Put forward', 'Interviewed', 'Placed in work',
  ];
  const body = rows.map(({ detail: d, learner: l, hasPassport }, i) => {
    const a = d.answers;
    return [
      ...(anonymise ? [`L${String(i + 1).padStart(4, '0')}`] : [d.reference, d.full_name, d.email, d.phone]),
      d.programme, d.cohort, d.track ?? '', d.source === 'imported' ? 'Imported' : 'Applied', text(a.gender),
      anonymise ? ageBand(ageOn(a.date_of_birth, new Date())) : text(a.date_of_birth),
      text(a.state_of_residence), text(a.lga), text(a.disability), text(a.education), text(a.employment_status),
      d.status === 'completed' ? 'Completed' : d.status === 'dropped' ? 'Dropped out' : 'Active',
      l.rate, anonymise ? (l.certified ? 'Yes' : 'No') : (l.certified ? d.serial : ''), d.score === null ? null : Number(d.score),
      d.completed_at ? d.completed_at.toISOString().slice(0, 10) : '', READINESS[learnerReadiness(l)],
      yesNo(hasPassport), yesNo(l.putForward), yesNo(l.interviewed), yesNo(l.placed),
    ];
  });
  return { header, body };
}
