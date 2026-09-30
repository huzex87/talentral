import 'server-only';
import type { Tx } from '@talentral/db';
import {
  G2, activation, attendanceShare, npsScore, watToday, weeklyActive,
  type ActivityDay, type HealthEnrolment, type NpsAudience, type NpsResult, type Rate, type WeekActive,
} from '@talentral/domain';

// Pilot health (Gate G2) for one hub, or for every active hub when tenantId is null (platform team).
// Activation and attendance count every cohort so far; weekly active is the last 7 days (with an
// 8-week trend); NPS counts answers from the last 180 days.

export const NPS_WINDOW_DAYS = 180;

export interface HealthGroup {
  id: string;
  name: string;
  hub: string;
  learners: number;
  activation: Rate;
  weeklyActive: Rate;
  attendance: Rate;
  npsLearners: NpsResult;
  npsStaff?: NpsResult;
}

export interface NpsComment { audience: NpsAudience; score: number; comment: string; created_at: Date; hub: string; cohort: string | null }

export interface Incident {
  id: string; occurred_on: string; summary: string; cross_tenant: boolean; personal_data: boolean;
  ndpc_notified_on: string | null; resolved_on: string | null; created_at: Date;
}

export interface HealthReport {
  today: string;
  learners: number;
  activation: Rate;
  weekly: WeekActive[];
  attendance: Rate;
  nps: Record<NpsAudience, NpsResult>;
  comments: NpsComment[];
  groups: HealthGroup[]; // cohorts for a hub, hubs for the platform
  incidents: Incident[] | null; // platform only
  crossTenantIncidents: number | null;
}

type EnrolRow = { id: string; cohort_id: string; cohort: string; tenant_id: string; hub: string; status: HealthEnrolment['status']; start: string; ends: string | null };
type MarkRow = { cohort_id: string; tenant_id: string; present: number; late: number; absent: number };
type NpsRow = { tenant_id: string; cohort_id: string | null; audience: NpsAudience; score: number; comment: string | null; created_at: Date };

export async function loadHealth(tx: Tx, tenantId: string | null, now = new Date()): Promise<HealthReport> {
  const scope = tenantId ? tx`c.tenant_id = ${tenantId}` : tx`t.status = 'active'`;
  const enrols = await tx<EnrolRow[]>`
    select e.id, e.cohort_id, c.name as cohort, c.tenant_id, t.name as hub, e.status,
      greatest((e.enrolled_at at time zone 'Africa/Lagos')::date, coalesce(c.starts_on, (e.enrolled_at at time zone 'Africa/Lagos')::date))::text as start,
      c.ends_on::text as ends
    from public.enrolments e join public.cohorts c on c.id = e.cohort_id join public.tenants t on t.id = c.tenant_id
    where ${scope}`;
  const days = (await tx<{ enrolment_id: string; day: string }[]>`select enrolment_id, day::text from app.health_days(${tenantId})`)
    .map((d): ActivityDay => ({ enrolmentId: d.enrolment_id, day: d.day }));
  const marks = await tx<MarkRow[]>`
    select cs.cohort_id, c.tenant_id,
      count(*) filter (where a.status = 'present')::int as present, count(*) filter (where a.status = 'late')::int as late,
      count(*) filter (where a.status = 'absent')::int as absent
    from public.attendance a join public.class_sessions cs on cs.id = a.session_id join public.cohorts c on c.id = cs.cohort_id join public.tenants t on t.id = c.tenant_id
    where ${scope} group by cs.cohort_id, c.tenant_id`;
  const answers = await tx<NpsRow[]>`
    select r.tenant_id, r.cohort_id, r.audience, r.score, r.comment, r.created_at
    from public.nps_responses r join public.tenants t on t.id = r.tenant_id
    where r.score is not null and r.created_at > now() - make_interval(days => ${NPS_WINDOW_DAYS})
      and ${tenantId ? tx`r.tenant_id = ${tenantId}` : tx`t.status = 'active'`}
    order by r.created_at desc`;

  const today = watToday(now);
  const toHealth = (e: EnrolRow): HealthEnrolment => ({ id: e.id, cohortId: e.cohort_id, status: e.status, start: e.start, cohortEnds: e.ends });
  const sumMarks = (rows: MarkRow[]) => attendanceShare(rows.reduce((s, m) => ({ present: s.present + m.present, late: s.late + m.late, absent: s.absent + m.absent }), { present: 0, late: 0, absent: 0 }));
  const score = (rows: NpsRow[], audience: NpsAudience) => npsScore(rows.filter((r) => r.audience === audience).map((r) => r.score));

  const all = enrols.map(toHealth);
  const weekly = weeklyActive(all, days, today);

  // One row per cohort (hub view) or per hub (platform view).
  const key = (e: { cohort_id: string | null; tenant_id: string }) => (tenantId ? e.cohort_id ?? '' : e.tenant_id);
  const names = new Map<string, { name: string; hub: string }>();
  for (const e of enrols) names.set(key(e), { name: tenantId ? e.cohort : e.hub, hub: e.hub });
  if (!tenantId) for (const r of answers) if (!names.has(r.tenant_id)) names.set(r.tenant_id, { name: '', hub: '' });
  if (!tenantId) {
    const missing = [...names.keys()].filter((k) => !names.get(k)!.name);
    if (missing.length) {
      for (const t of await tx<{ id: string; name: string }[]>`select id, name from public.tenants where id = any(${missing}::uuid[])`) names.set(t.id, { name: t.name, hub: t.name });
    }
  }
  const groups: HealthGroup[] = [...names.entries()].map(([id, n]) => {
    const members = enrols.filter((e) => key(e) === id).map(toHealth);
    const ids = new Set(members.map((m) => m.id));
    const mine = days.filter((d) => ids.has(d.enrolmentId));
    const nps = answers.filter((r) => (tenantId ? r.cohort_id === id : r.tenant_id === id));
    return {
      id, name: n.name, hub: n.hub, learners: members.filter((m) => m.status !== 'dropped').length,
      activation: activation(members, mine, today),
      weeklyActive: weeklyActive(members, mine, today, 1)[0]!,
      attendance: sumMarks(marks.filter((m) => (tenantId ? m.cohort_id === id : m.tenant_id === id))),
      npsLearners: score(nps, 'learner'),
      ...(tenantId ? {} : { npsStaff: score(nps, 'staff') }),
    };
  }).sort((a, b) => b.learners - a.learners || a.name.localeCompare(b.name));

  const cohortNames = new Map(enrols.map((e) => [e.cohort_id, e.cohort]));
  const hubOf = new Map(enrols.map((e) => [e.tenant_id, e.hub]));
  for (const g of groups) if (!tenantId) hubOf.set(g.id, g.name);

  let incidents: Incident[] | null = null;
  let crossTenant: number | null = null;
  if (!tenantId) {
    incidents = await tx<Incident[]>`
      select id, occurred_on::text, summary, cross_tenant, personal_data, ndpc_notified_on::text, resolved_on::text, created_at
      from public.security_incidents order by occurred_on desc, created_at desc limit 50`;
    crossTenant = incidents.filter((i) => i.cross_tenant).length;
  }

  return {
    today,
    learners: all.filter((e) => e.status !== 'dropped').length,
    activation: activation(all, days, today),
    weekly,
    attendance: sumMarks(marks),
    nps: { learner: score(answers, 'learner'), staff: score(answers, 'staff') },
    comments: answers.filter((r) => r.comment).slice(0, 30).map((r) => ({
      audience: r.audience, score: r.score, comment: r.comment!, created_at: r.created_at,
      hub: hubOf.get(r.tenant_id) ?? '', cohort: r.cohort_id ? cohortNames.get(r.cohort_id) ?? null : null,
    })),
    groups,
    incidents,
    crossTenantIncidents: crossTenant,
  };
}

export { G2 };
