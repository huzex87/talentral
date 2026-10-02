'use server';
// Learning paths (MVP-2 month 9): courses in order, from first lesson to a job-ready skill set.
// Owners and admins only; RLS enforces the same and keeps courses within the hub.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { withUser } from '@talentral/db';
import { requireHubRole } from '@/lib/auth';
import { syncCourseAssessments, syncPathAssessments } from '@/lib/course-data';

export interface PathState { ok?: boolean; message?: string; errors?: Record<string, string> }
const UUID = /^[0-9a-f-]{36}$/;
const base = (slug: string, id: string) => `/dashboard/${slug}/paths/${id}`;

const schema = z.object({
  title: z.string().trim().min(2, 'Give the path a title.').max(120),
  title_ha: z.string().trim().max(120),
  summary: z.string().trim().max(600, 'Keep the summary under 600 characters.'),
  summary_ha: z.string().trim().max(600, 'Keep the summary under 600 characters.'),
  outcome: z.string().trim().max(120),
});
const issues = (e: z.ZodError): PathState => {
  const errors: Record<string, string> = {};
  for (const i of e.issues) errors[String(i.path[0])] ??= i.message;
  return { errors };
};

export async function createPath(slug: string, _prev: PathState, form: FormData): Promise<PathState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const parsed = schema.pick({ title: true, outcome: true }).safeParse({ title: String(form.get('title') ?? ''), outcome: String(form.get('outcome') ?? '') });
  if (!parsed.success) return issues(parsed.error);
  const id = await withUser(user.id, async (tx) => {
    const [p] = await tx<{ id: string }[]>`insert into public.learning_paths (tenant_id, title, outcome, created_by) values (${hub.id}, ${parsed.data.title}, ${parsed.data.outcome || null}, ${user.id}) returning id`;
    await tx`select app.audit(${hub.id}, 'path.created', 'learning_path', ${p!.id})`;
    return p!.id;
  });
  redirect(`${base(slug, id)}?created=1`);
}

export async function savePath(slug: string, pathId: string, _prev: PathState, form: FormData): Promise<PathState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const parsed = schema.safeParse(Object.fromEntries(Object.keys(schema.shape).map((k) => [k, String(form.get(k) ?? '')])));
  if (!parsed.success) return issues(parsed.error);
  const d = parsed.data;
  await withUser(user.id, (tx) => tx`update public.learning_paths set title = ${d.title}, title_ha = ${d.title_ha || null}, summary = ${d.summary || null},
    summary_ha = ${d.summary_ha || null}, outcome = ${d.outcome || null}, sequential = ${form.get('sequential') === 'on'} where id = ${pathId} and tenant_id = ${hub.id}`);
  revalidatePath(base(slug, pathId));
  return { ok: true, message: 'Saved.' };
}

export async function setPathStatus(slug: string, pathId: string, status: 'draft' | 'published'): Promise<PathState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const result = await withUser(user.id, async (tx) => {
    if (status === 'published') {
      const [n] = await tx<{ n: number }[]>`select count(*)::int as n from public.learning_path_courses pc join public.courses c on c.id = pc.course_id and c.status = 'published' where pc.path_id = ${pathId}`;
      if (!n?.n) return { message: 'Add at least one published course first.' };
    }
    await tx`update public.learning_paths set status = ${status} where id = ${pathId} and tenant_id = ${hub.id}`;
    await tx`select app.audit(${hub.id}, ${status === 'published' ? 'path.published' : 'path.unpublished'}, 'learning_path', ${pathId})`;
    return { ok: true, message: status === 'published' ? 'Published. Cohorts following this path can start, and it shows on your hub page.' : 'Unpublished. Learners no longer see it.' };
  });
  revalidatePath(base(slug, pathId));
  return result;
}

export async function addPathCourse(slug: string, pathId: string, _prev: PathState, form: FormData): Promise<PathState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const courseId = String(form.get('course_id') ?? '');
  if (!UUID.test(courseId)) return { errors: { course_id: 'Choose a course.' } };
  await withUser(user.id, async (tx) => {
    await tx`insert into public.learning_path_courses (path_id, course_id, tenant_id, position)
      select ${pathId}, ${courseId}, ${hub.id}, coalesce(max(position) + 1, 0) from public.learning_path_courses where path_id = ${pathId}
      on conflict do nothing`;
    await syncCourseAssessments(tx, hub.id, courseId);
  });
  revalidatePath(base(slug, pathId));
  return { ok: true, message: 'Course added.' };
}

export async function removePathCourse(slug: string, pathId: string, courseId: string): Promise<void> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  await withUser(user.id, (tx) => tx`delete from public.learning_path_courses where path_id = ${pathId} and course_id = ${courseId} and tenant_id = ${hub.id}`);
  revalidatePath(base(slug, pathId));
}

export async function movePathCourse(slug: string, pathId: string, courseId: string, direction: -1 | 1): Promise<void> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  await withUser(user.id, async (tx) => {
    const rows = await tx<{ course_id: string }[]>`select course_id from public.learning_path_courses where path_id = ${pathId} and tenant_id = ${hub.id} order by position, course_id`;
    const i = rows.findIndex((r) => r.course_id === courseId);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= rows.length) return;
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
    for (const [k, r] of rows.entries()) await tx`update public.learning_path_courses set position = ${k} where path_id = ${pathId} and course_id = ${r.course_id}`;
  });
  revalidatePath(base(slug, pathId));
}

// A cohort follows one course or one learning path; choosing one clears the other.
export async function setCohortPath(slug: string, cohortId: string, pathId: string | null): Promise<PathState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const saved = await withUser(user.id, async (tx) => {
    const id = pathId && UUID.test(pathId) ? pathId : null;
    const rows = await tx`update public.cohorts set path_id = ${id}, course_id = case when ${id}::uuid is null then course_id else null end
      where id = ${cohortId} and tenant_id = ${hub.id} returning id`;
    if (!rows.length) return false;
    if (id) await syncPathAssessments(tx, hub.id, id);
    await tx`select app.audit(${hub.id}, 'cohort.path_set', 'cohort', ${cohortId}, ${tx.json({ path: id })})`;
    return true;
  });
  if (!saved) return { message: 'We could not change this cohort. Please try again.' };
  revalidatePath(`/dashboard/${slug}/cohorts/${cohortId}`);
  return { ok: true, message: pathId ? 'This cohort now follows the learning path. Quizzes and assignments from every course are in the gradebook.' : 'Learning path removed from this cohort.' };
}
