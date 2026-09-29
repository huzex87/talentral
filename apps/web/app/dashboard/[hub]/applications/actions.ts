'use server';
import { revalidatePath } from 'next/cache';
import { withUser } from '@talentral/db';
import { BULK_TARGETS, STATUS_LABELS, canMove, type ApplicationStatus } from '@talentral/domain';
import { hubAccess } from '@/lib/auth';
import { notifyStatusChange } from '@/lib/notify';
import { readFilters, whereClause } from './query';

const BULK_LIMIT = 2000;

export type Selection = { ids: string[] } | { filters: string };
export interface BulkResult { ok: boolean; message: string }

// Moves many applications at once. Each row is checked against the allowed moves and updated on
// its own, so the status trigger audits every change; rows that cannot move are skipped and counted.
export async function bulkMove(slug: string, selection: Selection, to: string, notify: boolean): Promise<BulkResult> {
  const { user, hub } = await hubAccess(slug);
  if (!(BULK_TARGETS as readonly string[]).includes(to)) return { ok: false, message: 'Choose a status.' };
  const target = to as ApplicationStatus;

  const { moved, skipped } = await withUser(user.id, async (tx) => {
    const rows = 'ids' in selection
      ? await tx<{ id: string; status: ApplicationStatus }[]>`
          select a.id, a.status from public.applications a
          where a.tenant_id = ${hub.id} and a.id = any (${selection.ids.filter((i) => /^[0-9a-f-]{36}$/.test(i)).slice(0, BULK_LIMIT)}::uuid[])
          for update`
      : await tx<{ id: string; status: ApplicationStatus }[]>`
          select a.id, a.status from public.applications a
          where ${whereClause(tx, hub.id, readFilters(Object.fromEntries(new URLSearchParams(selection.filters))))}
          limit ${BULK_LIMIT} for update`;
    const movable = rows.filter((r) => canMove(r.status, target));
    for (const r of movable) await tx`update public.applications set status = ${target} where id = ${r.id}`;
    await tx`select app.audit(${hub.id}, 'applications.bulk_status', 'tenant', ${hub.id}, ${tx.json({ to: target, moved: movable.length, skipped: rows.length - movable.length })})`;
    return { moved: movable.map((r) => r.id), skipped: rows.length - movable.length };
  });

  let emailed = 0;
  if (notify && moved.length) emailed = await notifyStatusChange(user.id, hub.id, moved, target);
  revalidatePath(`/dashboard/${slug}/applications`, 'layout');

  const parts = [`${moved.length} moved to ${STATUS_LABELS[target]}`];
  if (skipped) parts.push(`${skipped} skipped because they cannot move to that status from where they are`);
  if (notify && moved.length) parts.push(`${emailed} ${emailed === 1 ? 'applicant' : 'applicants'} emailed`);
  return { ok: moved.length > 0, message: `${parts.join('; ')}.` };
}
