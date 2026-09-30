'use server';
// Marking rubrics and peer review settings for assignments. Owners and admins only; the database
// policies check the lesson belongs to the hub and is an assignment.
import { revalidatePath } from 'next/cache';
import { withUser } from '@talentral/db';
import { sortLevels, validateLevels, type RubricLevel } from '@talentral/domain';
import { requireHubRole } from '@/lib/auth';

export interface RubricState { ok?: boolean; message?: string; at?: number }

const UUID = /^[0-9a-f-]{36}$/;
const path = (slug: string, courseId: string, lessonId: string) => `/dashboard/${slug}/courses/${courseId}/lessons/${lessonId}`;

function readCriterion(form: FormData): { title: string; title_ha: string | null; description: string | null; description_ha: string | null; levels: RubricLevel[] } | string {
  const title = String(form.get('title') ?? '').trim();
  if (title.length < 2 || title.length > 120) return 'Give the criterion a name of 2 to 120 characters.';
  const labels = form.getAll('level_label').map(String);
  const labelsHa = form.getAll('level_label_ha').map(String);
  const points = form.getAll('level_points').map((p) => (String(p).trim() === '' ? Number.NaN : Number(p)));
  const levels = sortLevels(labels.map((label, i) => ({ label: label.trim(), label_ha: labelsHa[i]?.trim() || null, points: points[i] ?? Number.NaN })));
  const problem = validateLevels(levels);
  if (problem) return problem;
  const text = (k: string, max: number) => String(form.get(k) ?? '').trim().slice(0, max) || null;
  return { title, title_ha: text('title_ha', 120), description: text('description', 600), description_ha: text('description_ha', 600), levels };
}

export async function saveCriterion(slug: string, courseId: string, lessonId: string, criterionId: string | null, _prev: RubricState, form: FormData): Promise<RubricState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  if (!UUID.test(lessonId) || (criterionId && !UUID.test(criterionId))) return { message: 'Something went wrong. Reload the page.' };
  const c = readCriterion(form);
  if (typeof c === 'string') return { message: c };
  await withUser(user.id, async (tx) => {
    if (criterionId) {
      await tx`update public.rubric_criteria set title = ${c.title}, title_ha = ${c.title_ha}, description = ${c.description}, description_ha = ${c.description_ha},
               levels = ${tx.json(c.levels as never)} where id = ${criterionId} and lesson_id = ${lessonId} and tenant_id = ${hub.id}`;
    } else {
      await tx`insert into public.rubric_criteria (tenant_id, lesson_id, position, title, title_ha, description, description_ha, levels)
               values (${hub.id}, ${lessonId}, (select coalesce(max(position), 0) + 1 from public.rubric_criteria where lesson_id = ${lessonId}),
                       ${c.title}, ${c.title_ha}, ${c.description}, ${c.description_ha}, ${tx.json(c.levels as never)})`;
    }
  });
  revalidatePath(path(slug, courseId, lessonId));
  return { ok: true, message: criterionId ? 'Criterion saved.' : 'Criterion added.', at: Date.now() };
}

export async function deleteCriterion(slug: string, courseId: string, lessonId: string, criterionId: string): Promise<void> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  await withUser(user.id, (tx) => tx`delete from public.rubric_criteria where id = ${criterionId} and lesson_id = ${lessonId} and tenant_id = ${hub.id}`);
  revalidatePath(path(slug, courseId, lessonId));
}

export async function moveCriterion(slug: string, courseId: string, lessonId: string, criterionId: string, direction: -1 | 1): Promise<void> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  await withUser(user.id, async (tx) => {
    const rows = await tx<{ id: string }[]>`select id from public.rubric_criteria where lesson_id = ${lessonId} and tenant_id = ${hub.id} order by position, created_at`;
    const i = rows.findIndex((r) => r.id === criterionId);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
    for (const [k, r] of rows.entries()) await tx`update public.rubric_criteria set position = ${k} where id = ${r.id}`;
  });
  revalidatePath(path(slug, courseId, lessonId));
}

export async function setPeerReviews(slug: string, courseId: string, lessonId: string, count: number): Promise<RubricState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const n = Math.max(0, Math.min(3, Math.round(count)));
  const changed = await withUser(user.id, (tx) => tx`update public.lessons set peer_reviews = ${n} where id = ${lessonId} and tenant_id = ${hub.id} and kind = 'assignment' returning id`);
  if (!changed.length) return { message: 'That could not be saved. Reload the page and try again.' };
  revalidatePath(path(slug, courseId, lessonId));
  return { ok: true, message: n ? `Each learner will review ${n} ${n === 1 ? 'classmate’s' : 'classmates’'} work.` : 'Peer review is off.' };
}
