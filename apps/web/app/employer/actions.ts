'use server';
// What an employer can do in their own account. Row-Level Security enforces the same rules:
// verified organisations only, their own roles only, and candidates only once they say yes.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { withUser } from '@talentral/db';
import { JOB_TYPES, NIGERIAN_STATES, WORK_MODES, cleanSkills } from '@talentral/domain';
import { requireEmployer, requireVerifiedEmployer } from '@/lib/employer';
import { env } from '@/lib/env';
import { employerInviteMail, sendMail } from '@/lib/mail';

export interface EmployerState { ok?: boolean; message?: string; errors?: Record<string, string> }

const UUID = /^[0-9a-f-]{36}$/;
const stateField = z.string().refine((v) => v === '' || (NIGERIAN_STATES as readonly string[]).includes(v), 'Choose a state.');
function issues(e: z.ZodError): EmployerState {
  const errors: Record<string, string> = {};
  for (const i of e.issues) errors[String(i.path[0])] ??= i.message;
  return { errors, message: 'Please check the highlighted fields.' };
}
const read = (form: FormData, keys: string[]) => Object.fromEntries(keys.map((k) => [k, String(form.get(k) ?? '')]));

const jobSchema = z.object({
  title: z.string().trim().min(2, 'Enter the job title.').max(160),
  description: z.string().trim().min(20, 'Describe the job in a few sentences.').max(4000),
  skills: z.string().max(2000),
  work_mode: z.enum(Object.keys(WORK_MODES) as [string, ...string[]]),
  job_type: z.enum(Object.keys(JOB_TYPES) as [string, ...string[]]),
  state: stateField,
  pay_min: z.string().regex(/^\d{0,9}$/, 'Enter a whole number of naira.'),
  pay_max: z.string().regex(/^\d{0,9}$/, 'Enter a whole number of naira.'),
  openings: z.string().regex(/^\d{1,3}$/, 'Enter how many people you need.'),
});

export async function postJob(_prev: EmployerState, form: FormData): Promise<EmployerState> {
  const { user, employer } = await requireEmployer();
  if (employer.status !== 'verified') return { message: 'You can post jobs once the talent team has verified your organisation.' };
  const parsed = jobSchema.safeParse(read(form, Object.keys(jobSchema.shape)));
  if (!parsed.success) return issues(parsed.error);
  const d = parsed.data;
  const min = d.pay_min ? Number(d.pay_min) : null;
  const max = d.pay_max ? Number(d.pay_max) : null;
  if (min === null || max === null) return { errors: { pay_min: 'Give a pay range. Jobs with pay ranges get more interest.' } };
  if (max < min) return { errors: { pay_max: 'The top of the range must be at least the bottom.' } };
  const skills = cleanSkills(d.skills.split(/[,\n]/), 20);
  if (!skills.length) return { errors: { skills: 'List the skills this job needs.' } };
  if (d.work_mode !== 'remote' && !d.state) return { errors: { state: 'Choose where the job is based.' } };
  const [row] = await withUser(user.id, (tx) => tx<{ id: string }[]>`
    insert into public.job_roles (employer_id, title, description, skills, work_mode, job_type, state, pay_min, pay_max, openings, created_by)
    values (${employer.id}, ${d.title}, ${d.description}, ${skills}, ${d.work_mode}, ${d.job_type}, ${d.state || null}, ${min}, ${max},
            ${Math.max(1, Number(d.openings))}, ${user.id}) returning id`);
  revalidatePath('/employer', 'layout');
  redirect(`/employer/jobs/${row!.id}?posted=1`);
}

export async function setJobStatus(jobId: string, status: 'open' | 'filled' | 'closed'): Promise<void> {
  const { user } = await requireVerifiedEmployer();
  await withUser(user.id, (tx) => tx`update public.job_roles set status = ${status} where id = ${jobId}`);
  revalidatePath('/employer', 'layout');
}

// Invites someone from the ranked matches. They are emailed and decide; nothing else is shared
// until they say yes.
export async function inviteCandidate(jobId: string, userId: string, _prev: EmployerState, _form: FormData): Promise<EmployerState> {
  const { user, employer } = await requireVerifiedEmployer();
  if (!UUID.test(jobId) || !UUID.test(userId)) return { message: 'Not found.' };
  const result = await withUser(user.id, async (tx) => {
    const [job] = await tx<{ title: string; status: string }[]>`select title, status from public.job_roles where id = ${jobId} and employer_id = ${employer.id}`;
    if (!job) return { message: 'Job not found.' };
    if (job.status !== 'open') return { message: 'This job is closed.' };
    const [person] = await tx<{ email: string; full_name: string | null }[]>`
      select u.email::text, u.full_name from public.passports p join public.users u on u.id = p.user_id where p.user_id = ${userId} and p.employer_search`;
    if (!person) return { message: 'This person is no longer open to employer search.' };
    const added = await tx`insert into public.role_candidates (role_id, user_id, added_by, invited_by_employer) values (${jobId}, ${userId}, ${user.id}, true)
                           on conflict (role_id, user_id) do nothing returning id`;
    if (!added.length) return { message: 'Already invited.' };
    return { ok: true as const, person, job };
  });
  if (!('ok' in result) || !result.person || !result.job) return { message: result.message };
  await sendMail(employerInviteMail(result.person.email, result.person.full_name ?? 'there', result.job.title, employer.name, `${env.appUrl}/passport`))
    .catch((e) => console.error('invite email failed', e));
  revalidatePath(`/employer/jobs/${jobId}`);
  return { ok: true, message: 'Invited. We emailed them.' };
}

const STAGES = ['shortlisted', 'interviewed', 'offered', 'placed', 'declined'] as const;
const candidateSchema = z.object({
  stage: z.enum(STAGES),
  notes: z.string().trim().max(2000),
  placement_type: z.union([z.literal(''), z.enum(Object.keys(JOB_TYPES) as [string, ...string[]])]),
  start_date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Enter a date.'),
  pay_band: z.string().trim().max(60),
});

export async function updateApplicant(candidateId: string, _prev: EmployerState, form: FormData): Promise<EmployerState> {
  const { user } = await requireVerifiedEmployer();
  const parsed = candidateSchema.safeParse(read(form, Object.keys(candidateSchema.shape)));
  if (!parsed.success) return issues(parsed.error);
  const d = parsed.data;
  if (d.stage === 'placed' && (!d.placement_type || !d.start_date)) return { errors: { placement_type: 'Add the type of work and start date to confirm the hire.' } };
  const rows = await withUser(user.id, (tx) => tx`
    update public.role_candidates set stage = ${d.stage}, notes = ${d.notes || null}, placement_type = ${d.placement_type || null},
      start_date = ${d.start_date || null}, pay_band = ${d.pay_band || null}
    where id = ${candidateId} returning role_id`);
  if (!rows.length) return { message: 'Not found.' };
  revalidatePath(`/employer/jobs/${rows[0]!.role_id}`);
  return { ok: true, message: d.stage === 'placed' ? 'Hire confirmed. We will ask you for a 90-day check.' : 'Saved.' };
}

// The 90-day retention check: is the person still working with you?
export async function recordRetention(candidateId: string, retained: boolean): Promise<void> {
  const { user } = await requireVerifiedEmployer();
  const rows = await withUser(user.id, (tx) => tx`
    update public.role_candidates set retained = ${retained}, retention_checked_at = now()
    where id = ${candidateId} and stage = 'placed' and start_date <= current_date - 90 returning role_id`);
  if (rows.length) revalidatePath(`/employer/jobs/${rows[0]!.role_id}`);
}

const profileSchema = z.object({
  sector: z.string().trim().max(80),
  website: z.string().trim().max(300).refine((v) => v === '' || /^https?:\/\/\S+\.\S+/.test(v), 'Enter a full web address starting with https://'),
  state: stateField,
  size: z.union([z.literal(''), z.enum(['1-10', '11-50', '51-200', '201+'])]),
  contact_name: z.string().trim().max(120),
  contact_phone: z.string().trim().max(30),
});

export async function saveEmployerProfile(_prev: EmployerState, form: FormData): Promise<EmployerState> {
  const { user, employer } = await requireEmployer();
  const parsed = profileSchema.safeParse(read(form, Object.keys(profileSchema.shape)));
  if (!parsed.success) return issues(parsed.error);
  const d = parsed.data;
  await withUser(user.id, (tx) => tx`select app.update_employer_profile(${employer.id}, ${d.sector}, ${d.website}, ${d.state}, ${d.size}, ${d.contact_name}, ${d.contact_phone})`);
  revalidatePath('/employer', 'layout');
  return { ok: true, message: 'Profile saved.' };
}
