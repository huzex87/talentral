import 'server-only';
import { describeAudit } from '@talentral/domain';
import type { AuditRow } from './audit-data';
import { writeCsv } from './xlsx-write';

export function auditCsv(rows: AuditRow[]): string {
  return writeCsv(
    ['Time (UTC)', 'Hub', 'Person', 'Email', 'Action', 'Description', 'Target type', 'Target id', 'Details'],
    rows.map((r) => [new Date(r.at).toISOString(), r.hub ?? 'Platform', r.actor ?? 'System', r.actor_email ?? '', r.action, describeAudit(r.action),
      r.target_type, r.target_id ?? '', JSON.stringify(r.metadata ?? {})]),
  );
}
