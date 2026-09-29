import 'server-only';
import type { Tx } from '@talentral/db';
import { auditPatterns } from '@talentral/domain';

export interface AuditRow {
  id: string; at: Date; action: string; target_type: string; target_id: string | null; metadata: Record<string, unknown>;
  actor: string | null; actor_email: string | null; hub: string | null;
}
export interface AuditFilter { group?: string; actor?: string; from?: string; to?: string; before?: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function readFilter(sp: Record<string, string | undefined>): AuditFilter {
  return {
    group: sp.group || undefined,
    actor: sp.actor && /^[0-9a-f-]{36}$/.test(sp.actor) ? sp.actor : undefined,
    from: sp.from && DATE.test(sp.from) ? sp.from : undefined,
    to: sp.to && DATE.test(sp.to) ? sp.to : undefined,
    before: sp.before && /^\d+$/.test(sp.before) ? sp.before : undefined,
  };
}

// Newest first. Row-level security limits hubs to their own events; platform admins see all.
// Dates are Nigerian days (West Africa Time).
export async function auditEvents(tx: Tx, tenantId: string | null, f: AuditFilter, limit = 100): Promise<AuditRow[]> {
  const patterns = f.group ? auditPatterns(f.group) : [];
  return tx<AuditRow[]>`
    select l.id::text, l.at, l.action, l.target_type, l.target_id, l.metadata,
           coalesce(u.full_name, u.email) as actor, u.email as actor_email, t.name as hub
    from public.audit_log l left join public.users u on u.id = l.actor_id left join public.tenants t on t.id = l.tenant_id
    where (${tenantId}::uuid is null or l.tenant_id = ${tenantId})
      and (cardinality(${patterns}::text[]) = 0 or l.action like any(${patterns}::text[]))
      and (${f.actor ?? null}::uuid is null or l.actor_id = ${f.actor ?? null})
      and (${f.from ?? null}::date is null or l.at >= (${f.from ?? null}::date)::timestamp at time zone 'Africa/Lagos')
      and (${f.to ?? null}::date is null or l.at < (${f.to ?? null}::date + 1)::timestamp at time zone 'Africa/Lagos')
      and (${f.before ?? null}::bigint is null or l.id < ${f.before ?? null}::bigint)
    order by l.id desc limit ${limit}`;
}

// People who appear in a hub's log, for the filter.
export async function auditActors(tx: Tx, tenantId: string | null): Promise<{ id: string; name: string }[]> {
  return tx<{ id: string; name: string }[]>`
    select distinct u.id, coalesce(u.full_name, u.email) as name from public.audit_log l join public.users u on u.id = l.actor_id
    where (${tenantId}::uuid is null or l.tenant_id = ${tenantId}) order by name limit 200`;
}

export function auditQuery(f: AuditFilter, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ group: f.group, actor: f.actor, from: f.from, to: f.to, ...extra })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}
