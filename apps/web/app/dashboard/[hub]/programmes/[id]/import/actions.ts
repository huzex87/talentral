'use server';
import { revalidatePath } from 'next/cache';
import { withUser, type Programme } from '@talentral/db';
import { IMPORT_STATUSES, checkRows, newReference, type FormField, type ImportRow, type Target } from '@talentral/domain';
import { requireHubRole } from '@/lib/auth';

export interface ImportResult { ok: boolean; imported: number; skipped: number; rejected: number; message?: string }

const CHUNK = 500;

// Imports one batch of spreadsheet rows. The browser sends the raw cells and the column mapping;
// every row is checked again here, so nothing the browser claims is trusted. Emails already in
// the programme are skipped, which also makes a repeated upload harmless.
export async function importBatch(slug: string, programmeId: string, status: string, mapping: Target[], rows: string[][], attested: boolean): Promise<ImportResult> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const fail = (message: string): ImportResult => ({ ok: false, imported: 0, skipped: 0, rejected: rows.length, message });
  if (!attested) return fail('Confirm that these participants agreed to share their details with your hub.');
  if (!(IMPORT_STATUSES as readonly string[]).includes(status)) return fail('Choose a starting status.');
  if (!Array.isArray(rows) || rows.length > CHUNK) return fail(`Send at most ${CHUNK} rows at a time.`);

  const [prog] = await withUser(user.id, (tx) => tx<Programme[]>`select * from public.programmes where id = ${programmeId} and tenant_id = ${hub.id}`);
  if (!prog) return fail('Programme not found.');

  const clean = rows.map((r) => (Array.isArray(r) ? r.slice(0, 200).map((c) => String(c ?? '').slice(0, 3000)) : []));
  const checks = checkRows(clean, mapping.slice(0, 200), prog.form as FormField[], prog.tracks);
  const valid = checks.flatMap((c) => (c.value ? [c.value] : []));
  if (!valid.length) return { ok: false, imported: 0, skipped: 0, rejected: rows.length, message: 'No valid rows in this batch.' };

  const payload = (v: ImportRow[]) => v.map((r) => ({ ...r, reference: newReference(prog.reference_prefix) }));
  let result: { imported: number; skipped: number } | undefined;
  for (let attempt = 0; attempt < 3 && !result; attempt += 1) {
    try {
      const [r] = await withUser(user.id, (tx) => tx<{ imported: number; skipped: number }[]>`
        select * from app.import_applications(${prog.id}, ${status}, ${tx.json(payload(valid) as never)})`);
      result = r;
    } catch (e) {
      // A generated reference collided with an existing one: try again with fresh references.
      if ((e as { constraint_name?: string }).constraint_name === 'applications_reference_key') continue;
      throw e;
    }
  }
  if (!result) return fail('Could not generate unique references. Please try again.');
  revalidatePath(`/dashboard/${slug}/applications`, 'layout');
  return { ok: true, imported: result.imported, skipped: result.skipped, rejected: rows.length - valid.length };
}
