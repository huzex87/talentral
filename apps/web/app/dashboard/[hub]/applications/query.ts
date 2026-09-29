// Shared filtering for the applications list and its CSV export.
import type { Tx } from '@talentral/db';
import { APPLICATION_STATUSES } from '@talentral/domain';

export interface Filters { programme?: string; status?: string; track?: string; q?: string; page?: number }

export function readFilters(sp: Record<string, string | undefined>): Filters {
  return {
    programme: sp.programme && /^[0-9a-f-]{36}$/.test(sp.programme) ? sp.programme : undefined,
    status: sp.status && (APPLICATION_STATUSES as readonly string[]).includes(sp.status) ? sp.status : undefined,
    track: sp.track?.slice(0, 120) || undefined,
    q: sp.q?.trim().slice(0, 100) || undefined,
    page: Math.max(1, Number(sp.page) || 1),
  };
}

export function whereClause(tx: Tx, tenantId: string, f: Filters) {
  const like = f.q ? `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  return tx`a.tenant_id = ${tenantId}
    ${f.programme ? tx`and a.programme_id = ${f.programme}` : tx``}
    ${f.status ? tx`and a.status = ${f.status}` : tx``}
    ${f.track ? tx`and a.track = ${f.track}` : tx``}
    ${like ? tx`and (a.full_name ilike ${like} or a.email::text ilike ${like} or a.reference ilike ${like} or a.phone ilike ${like})` : tx``}`;
}
