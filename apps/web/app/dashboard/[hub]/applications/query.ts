// Shared filtering for the applications list, its CSV export and bulk actions, so "select all
// matching" acts on exactly the rows the list shows.
import type { Tx } from '@talentral/db';
import { APPLICATION_STATUSES } from '@talentral/domain';

export const SORTS = { newest: 'Newest first', oldest: 'Oldest first', score: 'Highest score', name: 'Name (A to Z)' } as const;
export type Sort = keyof typeof SORTS;

export interface Filters {
  programme?: string; status?: string; track?: string; q?: string;
  gender?: string; state?: string; minScore?: number; scored?: 'yes' | 'no';
  sort: Sort; page: number;
}

const text = (v: string | undefined, max = 120) => v?.trim().slice(0, max) || undefined;

export function readFilters(sp: Record<string, string | undefined>): Filters {
  const min = Number(sp.min);
  return {
    programme: sp.programme && /^[0-9a-f-]{36}$/.test(sp.programme) ? sp.programme : undefined,
    status: sp.status && (APPLICATION_STATUSES as readonly string[]).includes(sp.status) ? sp.status : undefined,
    track: text(sp.track),
    q: text(sp.q, 100),
    gender: text(sp.gender, 40),
    state: text(sp.state, 40),
    minScore: sp.min && Number.isFinite(min) && min > 0 && min <= 100 ? min : undefined,
    scored: sp.scored === 'yes' || sp.scored === 'no' ? sp.scored : undefined,
    sort: sp.sort && sp.sort in SORTS ? (sp.sort as Sort) : 'newest',
    page: Math.max(1, Number(sp.page) || 1),
  };
}

// Query-string form of the filters, for links, exports and bulk actions.
export function filterParams(f: Filters, extra: Record<string, string | number | undefined> = {}): string {
  const u = new URLSearchParams();
  const all = { programme: f.programme, status: f.status, track: f.track, q: f.q, gender: f.gender, state: f.state,
    min: f.minScore, scored: f.scored, sort: f.sort === 'newest' ? undefined : f.sort, ...extra };
  for (const [k, v] of Object.entries(all)) if (v !== undefined && v !== '') u.set(k, String(v));
  return u.toString();
}

export const isFiltered = (f: Filters) => Boolean(f.programme || f.status || f.track || f.q || f.gender || f.state || f.minScore || f.scored);

// Average screening percentage for an application (null when nobody has scored it).
export const avgScore = (tx: Tx) => tx`(select round(avg(s.percent), 1) from public.application_scores s where s.application_id = a.id)`;

export function whereClause(tx: Tx, tenantId: string, f: Filters) {
  const like = f.q ? `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  return tx`a.tenant_id = ${tenantId}
    ${f.programme ? tx`and a.programme_id = ${f.programme}` : tx``}
    ${f.status ? tx`and a.status = ${f.status}` : tx``}
    ${f.track ? tx`and a.track = ${f.track}` : tx``}
    ${f.gender ? tx`and a.answers ->> 'gender' = ${f.gender}` : tx``}
    ${f.state ? tx`and a.answers ->> 'state_of_residence' = ${f.state}` : tx``}
    ${f.minScore ? tx`and ${avgScore(tx)} >= ${f.minScore}` : tx``}
    ${f.scored === 'yes' ? tx`and exists (select 1 from public.application_scores s where s.application_id = a.id)` : tx``}
    ${f.scored === 'no' ? tx`and not exists (select 1 from public.application_scores s where s.application_id = a.id)` : tx``}
    ${like ? tx`and (a.full_name ilike ${like} or a.email::text ilike ${like} or a.reference ilike ${like} or a.phone ilike ${like})` : tx``}`;
}

export function orderClause(tx: Tx, sort: Sort) {
  switch (sort) {
    case 'oldest': return tx`a.submitted_at asc`;
    case 'score': return tx`${avgScore(tx)} desc nulls last, a.submitted_at asc`;
    case 'name': return tx`a.full_name asc`;
    default: return tx`a.submitted_at desc`;
  }
}
