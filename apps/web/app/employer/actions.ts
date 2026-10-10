'use server';
// What an employer can do in their own account. Row-Level Security enforces the same rules:
// verified organisations only, their own roles only, and candidates only once they say yes.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { withUser } from '@talentral/db';
import { JOB_TYPES, NIGERIAN_STATES, WORK_MODES, addDays, cacNumberProblem, cleanSkills, normaliseCac, watToday } from '@talentral/domain';
import { adminEmails, requireEmployer, requireVerifiedEmployer } from '@/lib/employer';
import { env } from '@/lib/env';
import { applicationUpdateMail, employerReviewRequestMail, employerTeamMail, sendMail, shortlistRequestedMail, type NotifiedApplicationStage } from '@/lib/mail';
import { formatDate } from '@/lib/format';
import { issueReplyLink, notifyCandidate } from '@/lib/work';

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
  requirements: z.string().trim().max(3000),
  skills: z.string().max(2000),
  work_mode: z.enum(Object.keys(WORK_MODES) as [string, ...string[]]),
  job_type: z.enum(Object.keys(JOB_TYPES) as [string, ...string[]]),
  state: stateField,
  pay_min: z.string().regex(/^\d{0,9}$/, 'Enter a whole number of naira.'),
  pay_max: z.string().regex(/^\d{0,9}$/, 'Enter a whole number of naira.'),
  openings: z.string().regex(/^\d{1,3}$/, 'Enter how many people you need.'),
  closes_on: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Enter a date.'),
});

type JobInput = { title: string; description: string; requirements: string | null; skills: string[]; work_mode: string; job_type: string; state: string | null;
  pay_min: number; pay_max: number; openings: number; closes_on: string | null; on_board: boolean };

// Checks a job form; returns the values to store or the errors to show.
function readJob(form: FormData): { job: JobInput } | { state: EmployerState } {
  const parsed = jobSchema.safeParse(read(form, Object.keys(jobSchema.shape)));
  if (!parsed.success) return { state: issues(parsed.error) };
  const d = parsed.data;
  const min = d.pay_min ? Number(d.pay_min) : null;
  const max = d.pay_max ? Number(d.pay_max) : null;
  if (min === null || max === null) return { state: { errors: { pay_min: 'Give a pay range. Jobs with pay ranges get more interest.' } } };
  if (max < min) return { state: { errors: { pay_max: 'The top of the range must be at least the bottom.' } } };
  const skills = cleanSkills(d.skills.split(/[,\n]/), 20);
  if (!skills.length) return { state: { errors: { skills: 'List the skills this job needs.' } } };
  if (d.work_mode !== 'remote' && !d.state) return { state: { errors: { state: 'Choose where the job is based.' } } };
  const today = watToday(new Date());
  if (d.closes_on && (d.closes_on < today || d.closes_on > addDays(today, 180))) return { state: { errors: { closes_on: 'Choose a closing date within the next six months.' } } };
  return { job: { title: d.title, description: d.description, requirements: d.requirements || null, skills, work_mode: d.work_mode, job_type: d.job_type,
    state: d.state || null, pay_min: min, pay_max: max, openings: Math.max(1, Number(d.openings)), closes_on: d.closes_on || null, on_board: form.get('on_board') === 'on' } };
}

// A new job: published straight away, or kept as a draft to finish later.
export async function postJob(_prev: EmployerState, form: FormData): Promise<EmployerState> {
  const { user, employer } = await requireEmployer();
  if (employer.status !== 'verified') return { message: 'You can post jobs once the talent team has verified your organisation.' };
  const r = readJob(form);
  if ('state' in r) return r.state;
  const j = r.job;
  const draft = form.get('intent') === 'draft';
  const [row] = await withUser(user.id, (tx) => tx<{ id: string }[]>`
    insert into public.job_roles (employer_id, title, description, requirements, skills, work_mode, job_type, state, pay_min, pay_max, openings, closes_on, on_board,
      status, published_at, created_by)
    values (${employer.id}, ${j.title}, ${j.description}, ${j.requirements}, ${j.skills}, ${j.work_mode}, ${j.job_type}, ${j.state}, ${j.pay_min}, ${j.pay_max},
            ${j.openings}, ${j.closes_on}, ${j.on_board}, ${draft ? 'draft' : 'open'}, ${draft ? null : new Date()}, ${user.id}) returning id`);
  revalidatePath('/employer', 'layout');
  redirect(`/employer/jobs/${row!.id}?${draft ? 'draft' : 'posted'}=1`);
}

// Edits a job; a draft can be published at the same time.
export async function saveJob(jobId: string, _prev: EmployerState, form: FormData): Promise<EmployerState> {
  const { user } = await requireVerifiedEmployer();
  if (!UUID.test(jobId)) return { message: 'Not found.' };
  const r = readJob(form);
  if ('state' in r) return r.state;
  const j = r.job;
  const publish = form.get('intent') === 'publish';
  const rows = await withUser(user.id, (tx) => tx`
    update public.job_roles set title = ${j.title}, description = ${j.description}, requirements = ${j.requirements}, skills = ${j.skills}, work_mode = ${j.work_mode},
      job_type = ${j.job_type}, state = ${j.state}, pay_min = ${j.pay_min}, pay_max = ${j.pay_max}, openings = ${j.openings}, closes_on = ${j.closes_on}, on_board = ${j.on_board},
      status = case when ${publish} and status = 'draft' then 'open' else status end,
      published_at = case when ${publish} and status = 'draft' then now() else published_at end
    where id = ${jobId} returning status`);
  if (!rows.length) return { message: 'Not found.' };
  revalidatePath('/employer', 'layout');
  if (publish) redirect(`/employer/jobs/${jobId}?posted=1`);
  return { ok: true, message: 'Saved.' };
}

export async function setJobStatus(jobId: string, status: 'open' | 'filled' | 'closed'): Promise<void> {
  const { user } = await requireVerifiedEmployer();
  await withUser(user.id, (tx) => tx`update public.job_roles set status = ${status}, published_at = coalesce(published_at, case when ${status} = 'open' then now() end) where id = ${jobId}`);
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
    const added = await tx<{ id: string }[]>`insert into public.role_candidates (role_id, user_id, added_by, invited_by_employer) values (${jobId}, ${userId}, ${user.id}, true)
                           on conflict (role_id, user_id) do nothing returning id`;
    if (!added.length) return { message: 'Already invited.' };
    return { ok: true as const, person, job, url: await issueReplyLink(tx, added[0]!.id) };
  });
  if (!('ok' in result) || !result.person || !result.job) return { message: result.message };
  await notifyCandidate(userId, { role: result.job.title, employer: employer.name, url: result.url, invited: true });
  revalidatePath(`/employer/jobs/${jobId}`);
  return { ok: true, message: 'Invited. We emailed them.' };
}

// Asks the Talentral talent team for a shortlist, due in three working days. Asking again while
// one is pending keeps the original deadline and does not email the team twice.
export async function requestShortlist(jobId: string): Promise<void> {
  const { user, employer } = await requireVerifiedEmployer();
  if (!UUID.test(jobId)) return;
  const r = await withUser(user.id, async (tx) => {
    const [before] = await tx<{ title: string; pending: boolean }[]>`
      select title, (shortlist_requested_at is not null and shortlist_sent_at is null) as pending from public.job_roles where id = ${jobId} and employer_id = ${employer.id}`;
    if (!before) return null;
    const [d] = await tx<{ due: Date }[]>`select app.request_shortlist(${jobId}) as due`;
    return { title: before.title, due: d!.due, fresh: !before.pending };
  });
  if (r?.fresh) {
    const url = `${env.appUrl}/platform/talent/roles/${jobId}`;
    await Promise.all(adminEmails().map((to) => sendMail(shortlistRequestedMail(to, employer.name, r.title, `${formatDate(r.due, true)} WAT`, url))
      .catch((e) => console.error('shortlist request email failed', e))));
  }
  revalidatePath(`/employer/jobs/${jobId}`);
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
  const { user, employer } = await requireVerifiedEmployer();
  if (!UUID.test(candidateId)) return { message: 'Not found.' };
  const parsed = candidateSchema.safeParse(read(form, Object.keys(candidateSchema.shape)));
  if (!parsed.success) return issues(parsed.error);
  const d = parsed.data;
  if (d.stage === 'placed' && (!d.placement_type || !d.start_date)) return { errors: { placement_type: 'Add the type of work and start date to confirm the hire.' } };
  const result = await withUser(user.id, async (tx) => {
    const [before] = await tx<{ stage: string; role_id: string; title: string; user_id: string }[]>`
      select c.stage, c.role_id, r.title, c.user_id from public.role_candidates c join public.job_roles r on r.id = c.role_id where c.id = ${candidateId}`;
    if (!before) return null;
    await tx`
      update public.role_candidates set stage = ${d.stage}, notes = ${d.notes || null}, placement_type = ${d.placement_type || null},
        start_date = ${d.start_date || null}, pay_band = ${d.pay_band || null}
      where id = ${candidateId}`;
    // Tell the learner when their application moves on (not for private notes or corrections).
    if (before.stage === d.stage || d.stage === 'shortlisted') return { before, contact: null };
    const [contact] = await tx<{ email: string }[]>`select email from app.candidate_contact(${candidateId})`;
    const [person] = await tx<{ full_name: string | null; language: 'en' | 'ha' }[]>`select full_name, language from public.users where id = ${before.user_id}`;
    return { before, contact: contact ? { email: contact.email, name: person?.full_name ?? 'there', language: person?.language ?? 'en' as const } : null };
  });
  if (!result) return { message: 'Not found.' };
  if (result.contact) {
    await sendMail(applicationUpdateMail(result.contact.email, result.contact.name, result.before.title, employer.name, d.stage as NotifiedApplicationStage, result.contact.language, `${env.appUrl}/jobs/applications`))
      .catch((e) => console.error('application update email failed', e));
  }
  revalidatePath(`/employer/jobs/${result.before.role_id}`);
  return { ok: true, message: d.stage === 'placed' ? 'Hire confirmed. We will ask you for a 90-day check.' : result.contact ? 'Saved. We emailed the candidate.' : 'Saved.' };
}

// One click: the employer confirms a hire the Talentral talent team recorded.
export async function confirmHire(candidateId: string): Promise<void> {
  const { user } = await requireVerifiedEmployer();
  if (!UUID.test(candidateId)) return;
  const rows = await withUser(user.id, async (tx) => {
    await tx`select app.confirm_placement(${candidateId}, null)`;
    return tx<{ role_id: string }[]>`select role_id from public.role_candidates where id = ${candidateId}`;
  });
  if (rows.length) revalidatePath(`/employer/jobs/${rows[0]!.role_id}`);
  revalidatePath('/employer');
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
  cac_number: z.string().trim().max(20).refine((v) => !cacNumberProblem(v), 'Enter the CAC number as shown on the certificate, for example RC 1234567 or BN 2345678.'),
});

export async function saveEmployerProfile(_prev: EmployerState, form: FormData): Promise<EmployerState> {
  const { user, employer } = await requireEmployer();
  const parsed = profileSchema.safeParse(read(form, Object.keys(profileSchema.shape)));
  if (!parsed.success) return issues(parsed.error);
  const d = parsed.data;
  await withUser(user.id, (tx) => tx`select app.save_employer_details(${employer.id}, ${d.sector}, ${d.website}, ${d.state}, ${d.size}, ${d.contact_name}, ${d.contact_phone}, ${d.cac_number ? normaliseCac(d.cac_number) : ''})`);
  revalidatePath('/employer', 'layout');
  return { ok: true, message: 'Profile saved.' };
}

// After a rejection: the employer has fixed their details and asks the talent team to look again.
export async function requestReview(): Promise<EmployerState> {
  const { user, employer } = await requireEmployer();
  try {
    await withUser(user.id, (tx) => tx`select app.request_employer_review(${employer.id})`);
  } catch {
    return { message: 'Your organisation is not waiting for changes.' };
  }
  await Promise.all(adminEmails().map((to) => sendMail(employerReviewRequestMail(to, employer.name, `${env.appUrl}/platform/talent/employers/${employer.id}`)).catch(() => undefined)));
  // No page refresh: the confirmation stays on screen; the status shows as pending on the next visit.
  return { ok: true, message: 'Thank you. The talent team will review your organisation again, usually within one working day.' };
}

// ---------------------------------------------------------------- team

const memberSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(160),
  full_name: z.string().trim().max(120),
  role: z.enum(['owner', 'member']),
});

export async function addTeamMember(_prev: EmployerState, form: FormData): Promise<EmployerState> {
  const { user, employer } = await requireEmployer();
  if (employer.my_role !== 'owner') return { message: 'Only owners can add people.' };
  const parsed = memberSchema.safeParse(read(form, ['email', 'full_name', 'role']));
  if (!parsed.success) return issues(parsed.error);
  const d = parsed.data;
  try {
    await withUser(user.id, (tx) => tx`select app.add_employer_member(${employer.id}, ${d.email}, ${d.full_name}, ${d.role})`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    return { errors: { email: /Already in your team/.test(msg) ? 'This person is already in your team.' : /up to 20/.test(msg) ? 'An organisation can have up to 20 people.' : 'We could not add this person. Please try again.' } };
  }
  await sendMail(employerTeamMail(d.email, d.full_name || null, employer.name, user.full_name ?? user.email, d.role, `${env.appUrl}/sign-in`)).catch((e) => console.error('team email failed', e));
  revalidatePath('/employer/team');
  return { ok: true, message: `${d.full_name || d.email} was added and emailed a link to sign in.` };
}

// Change someone's role, remove them (role null), or leave (your own id, role null).
export async function changeTeamMember(memberId: string, role: 'owner' | 'member' | null): Promise<EmployerState> {
  const { user, employer } = await requireEmployer();
  if (!UUID.test(memberId)) return { message: 'Not found.' };
  try {
    await withUser(user.id, (tx) => tx`select app.change_employer_member(${employer.id}, ${memberId}, ${role})`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    return { message: /needs an owner/.test(msg) ? 'Every organisation needs an owner. Make someone else an owner first.' : 'Only owners can change the team.' };
  }
  if (memberId === user.id && role === null) redirect('/dashboard');
  revalidatePath('/employer/team');
  return { ok: true };
}
