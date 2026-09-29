'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { withUser } from '@talentral/db';
import { MARKS, newCheckinCode, type Mark } from '@talentral/domain';
import { hubAccess, requireHubRole } from '@/lib/auth';
import { fromLocalInput } from '@/lib/format';

export interface FormState { ok?: boolean; message?: string; errors?: Record<string, string> }
const UUID = /^[0-9a-f-]{36}$/;

const cohortSchema = z.object({
  programme: z.string().regex(UUID, 'Choose a programme.'),
  name: z.string().trim().min(2, 'Name the cohort, for example "Cohort 1".').max(120),
  starts_on: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  ends_on: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  min_attendance: z.coerce.number().int().min(0, 'Between 0 and 100.').max(100, 'Between 0 and 100.'),
});

export async function createCohort(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const parsed = cohortSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors };
  }
  const d = parsed.data;
  if (d.starts_on && d.ends_on && d.ends_on < d.starts_on) return { errors: { ends_on: 'The end date must be after the start date.' } };
  const [row] = await withUser(user.id, async (tx) => {
    const r = await tx<{ id: string }[]>`
      insert into public.cohorts (tenant_id, programme_id, name, starts_on, ends_on, min_attendance)
      values (${hub.id}, ${d.programme}, ${d.name}, ${d.starts_on || null}, ${d.ends_on || null}, ${d.min_attendance}) returning id`;
    await tx`select app.audit(${hub.id}, 'cohort.created', 'cohort', ${r[0]!.id})`;
    return r;
  });
  redirect(`/dashboard/${slug}/cohorts/${row!.id}`);
}

// Enrols every accepted applicant of the cohort's programme who is not yet in a cohort.
export async function admitAccepted(slug: string, cohortId: string): Promise<FormState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const n = await withUser(user.id, async (tx) => {
    const rows = await tx<{ id: string }[]>`
      insert into public.enrolments (tenant_id, cohort_id, application_id)
      select ${hub.id}, c.id, a.id from public.cohorts c
      join public.applications a on a.programme_id = c.programme_id and a.status = 'accepted'
      where c.id = ${cohortId} and c.tenant_id = ${hub.id}
        and not exists (select 1 from public.enrolments e where e.application_id = a.id)
      returning id`;
    if (rows.length) await tx`select app.audit(${hub.id}, 'cohort.admitted', 'cohort', ${cohortId}, ${tx.json({ learners: rows.length })})`;
    return rows.length;
  });
  revalidatePath(`/dashboard/${slug}/cohorts`, 'layout');
  return { ok: n > 0, message: n ? `${n} ${n === 1 ? 'learner' : 'learners'} added to the cohort.` : 'Everyone accepted is already in a cohort.' };
}

export async function setEnrolmentStatus(slug: string, cohortId: string, ids: string[], status: 'active' | 'completed' | 'dropped', reason = ''): Promise<FormState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  if (!['active', 'completed', 'dropped'].includes(status)) return { message: 'Unknown status.' };
  const clean = ids.filter((i) => UUID.test(i)).slice(0, 2000);
  const n = await withUser(user.id, async (tx) => {
    const rows = await tx<{ id: string }[]>`
      update public.enrolments set status = ${status},
        completed_at = ${status === 'completed' ? tx`now()` : null},
        dropped_reason = ${status === 'dropped' ? reason.trim().slice(0, 300) || null : null}
      where tenant_id = ${hub.id} and cohort_id = ${cohortId} and id = any (${clean}::uuid[]) returning id`;
    await tx`select app.audit(${hub.id}, 'cohort.enrolment_status', 'cohort', ${cohortId}, ${tx.json({ status, learners: rows.length })})`;
    return rows.length;
  });
  revalidatePath(`/dashboard/${slug}/cohorts/${cohortId}`);
  const verb = status === 'completed' ? 'marked as completed' : status === 'dropped' ? 'marked as dropped out' : 'set back to active';
  return { ok: true, message: `${n} ${n === 1 ? 'learner' : 'learners'} ${verb}.` };
}

export async function setCohortStatus(slug: string, cohortId: string, status: 'planned' | 'running' | 'completed') {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  if (!['planned', 'running', 'completed'].includes(status)) return;
  await withUser(user.id, (tx) => tx`update public.cohorts set status = ${status} where id = ${cohortId} and tenant_id = ${hub.id}`);
  revalidatePath(`/dashboard/${slug}/cohorts`, 'layout');
}

const sessionSchema = z.object({
  title: z.string().trim().min(2, 'Give the session a title.').max(160),
  starts_at: z.string().min(1, 'Choose when it starts.'),
  duration: z.coerce.number().int().min(15).max(600),
  mode: z.enum(['in_person', 'online', 'hybrid']),
  location: z.string().trim().max(300),
  facilitator: z.string().trim().max(120),
});

export async function createSession(slug: string, cohortId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const parsed = sessionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors };
  }
  const d = parsed.data;
  const start = fromLocalInput(d.starts_at);
  if (!start) return { errors: { starts_at: 'Choose a valid date and time.' } };
  const end = new Date(start.getTime() + d.duration * 60_000);
  await withUser(user.id, (tx) => tx`
    insert into public.class_sessions (tenant_id, cohort_id, title, starts_at, ends_at, mode, location, facilitator, checkin_code)
    select ${hub.id}, c.id, ${d.title}, ${start}, ${end}, ${d.mode}, ${d.location || null}, ${d.facilitator || null}, ${newCheckinCode()}
    from public.cohorts c where c.id = ${cohortId} and c.tenant_id = ${hub.id}`);
  revalidatePath(`/dashboard/${slug}/cohorts/${cohortId}`);
  return { ok: true, message: `“${d.title}” added to the timetable.` };
}

export async function setCheckin(slug: string, sessionId: string, open: boolean, newCode = false) {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  await withUser(user.id, (tx) => tx`
    update public.class_sessions set checkin_open = ${open} ${newCode ? tx`, checkin_code = ${newCheckinCode()}` : tx``}
    where id = ${sessionId} and tenant_id = ${hub.id}`);
  revalidatePath(`/dashboard/${slug}/cohorts`, 'layout');
}

// One register mark from a team member; overrides a learner's own check-in.
export async function markAttendance(slug: string, sessionId: string, enrolmentId: string, mark: Mark): Promise<boolean> {
  const { user, hub } = await hubAccess(slug);
  if (!MARKS.includes(mark) || !UUID.test(sessionId) || !UUID.test(enrolmentId)) return false;
  await withUser(user.id, (tx) => tx`
    insert into public.attendance (tenant_id, session_id, enrolment_id, status, method, marked_by)
    values (${hub.id}, ${sessionId}, ${enrolmentId}, ${mark}, 'register', ${user.id})
    on conflict (session_id, enrolment_id)
    do update set status = excluded.status, method = 'register', marked_by = excluded.marked_by, marked_at = now()`);
  return true;
}

// Marks everyone without a mark yet, typically "absent" once the class is over.
export async function markRemaining(slug: string, sessionId: string, mark: Mark): Promise<number> {
  const { user, hub } = await hubAccess(slug);
  if (!MARKS.includes(mark)) return 0;
  const rows = await withUser(user.id, (tx) => tx<{ id: string }[]>`
    insert into public.attendance (tenant_id, session_id, enrolment_id, status, method, marked_by)
    select ${hub.id}, s.id, e.id, ${mark}, 'register', ${user.id}
    from public.class_sessions s join public.enrolments e on e.cohort_id = s.cohort_id and e.status <> 'dropped'
    where s.id = ${sessionId} and s.tenant_id = ${hub.id}
      and not exists (select 1 from public.attendance a where a.session_id = s.id and a.enrolment_id = e.id)
    returning id`);
  revalidatePath(`/dashboard/${slug}/cohorts`, 'layout');
  return rows.length;
}
