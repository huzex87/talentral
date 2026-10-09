import 'server-only';
// Outcomes (Gate G3) for one hub, or for every active hub when tenantId is null (platform
// team): completion, readiness assessed among completers, employers engaged (platform only) and
// placements, with employer confirmation and the 90-day retention check alongside.
import type { Tx } from '@talentral/db';
import { employerEngaged, g3Summary, watToday, type G3Enrolment, type G3Result } from '@talentral/domain';

export interface OutcomeGroup extends G3Result { id: string; name: string; learners: number }
export interface EngagedEmployer {
  id: string; name: string; status: string; jobs: number; candidates: number; shortlists: number; hires: number; engaged: boolean;
}
export interface OutcomesReport {
  today: string;
  learners: number;
  summary: G3Result;
  groups: OutcomeGroup[]; // cohorts for a hub, hubs for the platform
  employers: EngagedEmployer[] | null; // platform only
  employersEngaged: number | null;
}

type Row = { enrolment_id: string; tenant_id: string; hub: string; cohort_id: string; cohort: string; cohort_ended: boolean; status: G3Enrolment['status'];
  assessed: boolean; placed: boolean; confirmed: boolean; retained: boolean | null; retention_due: boolean };

const toG3 = (r: Row): G3Enrolment => ({ status: r.status, cohortEnded: r.cohort_ended, assessed: r.assessed, placed: r.placed, confirmed: r.confirmed, retained: r.retained, retentionDue: r.retention_due });

export async function loadOutcomes(tx: Tx, tenantId: string | null, now = new Date()): Promise<OutcomesReport> {
  const rows = await tx<Row[]>`select * from app.g3_enrolments(${tenantId})`;
  const key = (r: Row) => (tenantId ? r.cohort_id : r.tenant_id);
  const byKey = new Map<string, { name: string; rows: Row[] }>();
  for (const r of rows) {
    const g = byKey.get(key(r)) ?? { name: tenantId ? r.cohort : r.hub, rows: [] };
    g.rows.push(r);
    byKey.set(key(r), g);
  }
  const groups = [...byKey.entries()].map(([id, g]) => ({ id, name: g.name, learners: g.rows.filter((r) => r.status !== 'dropped').length, ...g3Summary(g.rows.map(toG3)) }))
    .sort((a, b) => b.learners - a.learners || a.name.localeCompare(b.name));

  let employers: EngagedEmployer[] | null = null;
  if (!tenantId) {
    const list = await tx<Omit<EngagedEmployer, 'engaged'>[]>`
      select e.id, e.name, e.status,
        (select count(*)::int from public.job_roles r where r.employer_id = e.id and r.status <> 'draft') as jobs,
        (select count(*)::int from public.role_candidates c join public.job_roles r on r.id = c.role_id where r.employer_id = e.id) as candidates,
        (select count(*)::int from public.shortlist_links l join public.job_roles r on r.id = l.role_id where r.employer_id = e.id) as shortlists,
        (select count(*)::int from public.role_candidates c join public.job_roles r on r.id = c.role_id where r.employer_id = e.id and c.stage = 'placed') as hires
      from public.employers e order by e.name`;
    employers = list.map((e) => ({ ...e, engaged: employerEngaged({ jobsPublished: e.jobs, shortlists: e.shortlists, candidates: e.candidates }) }))
      .sort((a, b) => Number(b.engaged) - Number(a.engaged) || b.hires - a.hires || b.candidates - a.candidates || a.name.localeCompare(b.name));
  }

  return {
    today: watToday(now),
    learners: rows.filter((r) => r.status !== 'dropped').length,
    summary: g3Summary(rows.map(toG3)),
    groups,
    employers,
    employersEngaged: employers ? employers.filter((e) => e.engaged).length : null,
  };
}
