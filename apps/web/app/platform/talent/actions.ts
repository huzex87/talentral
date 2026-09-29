'use server';
// Talent officer actions: employers, roles, candidates, placements and shortlist links.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { withUser } from '@talentral/db';
import { CANDIDATE_STAGES, EMPLOYER_STAGES, JOB_TYPES, NIGERIAN_STATES, SHORTLIST_DAYS, WORK_MODES, cleanSkills } from '@talentral/domain';
import { requirePlatformAdmin } from '@/lib/auth';
import { env } from '@/lib/env';
import { opportunityMail, sendMail } from '@/lib/mail';
import { newToken } from '@/lib/tokens';

export interface TalentState { ok?: boolean; message?: string; errors?: Record<string, string>; url?: string }

const optionalUrl = z.string().trim().max(300).refine((v) => v === '' || /^https?:\/\/\S+\.\S+/.test(v), 'Enter a full web address starting with https://');
const stateField = z.string().refine((v) => v === '' || (NIGERIAN_STATES as readonly string[]).includes(v), 'Choose a state.');

function issues(e: z.ZodError) {
  const errors: Record<string, string> = {};
  for (const i of e.issues) errors[String(i.path[0])] ??= i.message;
  return { errors, message: 'Please check the highlighted fields.' };
}

const employerSchema = z.object({
  name: z.string().trim().min(2, 'Enter the employer name.').max(160),
  sector: z.string().trim().max(80),
  website: optionalUrl,
  state: stateField,
  contact_name: z.string().trim().max(120),
  contact_email: z.string().trim().toLowerCase().max(160).refine((v) => v === '' || z.string().email().safeParse(v).success, 'Enter a valid email address.'),
  contact_phone: z.string().trim().max(30),
  stage: z.enum(Object.keys(EMPLOYER_STAGES) as [string, ...string[]]),
  notes: z.string().trim().max(4000),
});
const read = (form: FormData, keys: string[]) => Object.fromEntries(keys.map((k) => [k, String(form.get(k) ?? '')]));

export async function saveEmployer(id: string | null, _prev: TalentState, form: FormData): Promise<TalentState> {
  const user = await requirePlatformAdmin();
  const parsed = employerSchema.safeParse(read(form, Object.keys(employerSchema.shape)));
  if (!parsed.success) return issues(parsed.error);
  const d = Object.fromEntries(Object.entries(parsed.data).map(([k, v]) => [k, v === '' ? null : v]));
  const saved = await withUser(user.id, async (tx) => {
    if (id) {
      await tx`update public.employers set ${tx(d, 'name', 'sector', 'website', 'state', 'contact_name', 'contact_email', 'contact_phone', 'stage', 'notes')} where id = ${id}`;
      return id;
    }
    const [row] = await tx<{ id: string }[]>`insert into public.employers ${tx({ ...d, created_by: user.id })} returning id`;
    return row!.id;
  });
  revalidatePath('/platform/talent', 'layout');
  if (!id) redirect(`/platform/talent/employers/${saved}`);
  return { ok: true, message: 'Employer saved.' };
}

const roleSchema = z.object({
  title: z.string().trim().min(2, 'Enter the role title.').max(160),
  description: z.string().trim().max(4000),
  skills: z.string().max(2000),
  work_mode: z.enum(Object.keys(WORK_MODES) as [string, ...string[]]),
  job_type: z.enum(Object.keys(JOB_TYPES) as [string, ...string[]]),
  state: stateField,
  pay_min: z.string().regex(/^\d{0,9}$/, 'Enter a whole number of naira.'),
  pay_max: z.string().regex(/^\d{0,9}$/, 'Enter a whole number of naira.'),
  openings: z.string().regex(/^\d{1,3}$/, 'Enter how many people they need.'),
});

export async function createRole(employerId: string, _prev: TalentState, form: FormData): Promise<TalentState> {
  const user = await requirePlatformAdmin();
  const parsed = roleSchema.safeParse(read(form, Object.keys(roleSchema.shape)));
  if (!parsed.success) return issues(parsed.error);
  const d = parsed.data;
  const min = d.pay_min ? Number(d.pay_min) : null;
  const max = d.pay_max ? Number(d.pay_max) : null;
  if (min !== null && max !== null && max < min) return { errors: { pay_max: 'The top of the range must be at least the bottom.' } };
  const skills = cleanSkills(d.skills.split(/[,\n]/), 20);
  if (skills.length === 0) return { errors: { skills: 'List the skills this role needs.' } };
  const [row] = await withUser(user.id, (tx) => tx<{ id: string }[]>`
    insert into public.job_roles (employer_id, title, description, skills, work_mode, job_type, state, pay_min, pay_max, openings, created_by)
    values (${employerId}, ${d.title}, ${d.description || null}, ${skills}, ${d.work_mode}, ${d.job_type}, ${d.state || null}, ${min}, ${max},
            ${Math.max(1, Number(d.openings))}, ${user.id}) returning id`);
  revalidatePath('/platform/talent', 'layout');
  redirect(`/platform/talent/roles/${row!.id}`);
}

export async function setRoleStatus(roleId: string, status: 'open' | 'filled' | 'closed'): Promise<void> {
  const user = await requirePlatformAdmin();
  await withUser(user.id, (tx) => tx`update public.job_roles set status = ${status} where id = ${roleId}`);
  revalidatePath('/platform/talent', 'layout');
}

// Puts a person forward for a role and asks them to confirm interest. Nothing reaches the
// employer until they say yes.
export async function addCandidate(roleId: string, userId: string): Promise<TalentState> {
  const user = await requirePlatformAdmin();
  const result = await withUser(user.id, async (tx) => {
    const [role] = await tx<{ title: string; employer: string; status: string }[]>`
      select r.title, e.name as employer, r.status from public.job_roles r join public.employers e on e.id = r.employer_id where r.id = ${roleId}`;
    if (!role) return { message: 'Role not found.' };
    if (role.status !== 'open') return { message: 'This role is no longer open.' };
    const [person] = await tx<{ email: string; full_name: string | null }[]>`
      select u.email::text, u.full_name from public.passports p join public.users u on u.id = p.user_id where p.user_id = ${userId}`;
    if (!person) return { message: 'This person is no longer visible to talent officers.' };
    const added = await tx`insert into public.role_candidates (role_id, user_id, added_by) values (${roleId}, ${userId}, ${user.id})
                           on conflict (role_id, user_id) do nothing returning id`;
    if (!added.length) return { message: `${person.full_name ?? 'This person'} is already on this role.` };
    return { ok: true, person, role };
  });
  if ('person' in result && result.person) {
    await sendMail(opportunityMail(result.person.email, result.person.full_name ?? 'there', result.role!.title, result.role!.employer, `${env.appUrl}/passport`))
      .catch((e) => console.error('opportunity email failed', e));
  }
  revalidatePath('/platform/talent', 'layout');
  return 'ok' in result && result.ok
    ? { ok: true, message: `${result.person!.full_name ?? 'Candidate'} added and asked to confirm interest.` }
    : { message: (result as TalentState).message };
}

export async function addCandidateForm(roleId: string, userId: string, _prev: TalentState, _form: FormData): Promise<TalentState> {
  return addCandidate(roleId, userId);
}

export async function addToRoleForm(userId: string, _prev: TalentState, form: FormData): Promise<TalentState> {
  const roleId = String(form.get('role_id') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(roleId)) return { message: 'Choose a role.' };
  return addCandidate(roleId, userId);
}

const PLACEMENT_TYPES = Object.keys(JOB_TYPES) as [string, ...string[]];
const candidateSchema = z.object({
  stage: z.enum(Object.keys(CANDIDATE_STAGES) as [string, ...string[]]),
  notes: z.string().trim().max(2000),
  placement_type: z.union([z.literal(''), z.enum(PLACEMENT_TYPES)]),
  start_date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Enter a date.'),
  pay_band: z.string().trim().max(60),
});

export async function updateCandidate(candidateId: string, _prev: TalentState, form: FormData): Promise<TalentState> {
  const user = await requirePlatformAdmin();
  const parsed = candidateSchema.safeParse(read(form, Object.keys(candidateSchema.shape)));
  if (!parsed.success) return issues(parsed.error);
  const d = parsed.data;
  if (d.stage === 'placed' && (!d.placement_type || !d.start_date)) {
    return { errors: { placement_type: 'Record the type of work and start date for a placement.' }, message: 'Add the placement details.' };
  }
  await withUser(user.id, (tx) => tx`
    update public.role_candidates set stage = ${d.stage}, notes = ${d.notes || null}, placement_type = ${d.placement_type || null},
      start_date = ${d.start_date || null}, pay_band = ${d.pay_band || null}
    where id = ${candidateId}`);
  revalidatePath('/platform/talent', 'layout');
  return { ok: true, message: d.stage === 'placed' ? 'Placement recorded.' : 'Saved.' };
}

export async function removeCandidate(candidateId: string): Promise<void> {
  const user = await requirePlatformAdmin();
  await withUser(user.id, (tx) => tx`delete from public.role_candidates where id = ${candidateId} and interest <> 'confirmed'`);
  revalidatePath('/platform/talent', 'layout');
}

// The link is shown once; only its hash is stored.
export async function createShortlistLink(roleId: string): Promise<TalentState> {
  const user = await requirePlatformAdmin();
  const { token, hash } = newToken();
  const ready = await withUser(user.id, async (tx) => {
    const [c] = await tx<{ n: number }[]>`select count(*)::int as n from public.role_candidates where role_id = ${roleId} and interest = 'confirmed' and stage <> 'declined'`;
    if (!c?.n) return false;
    await tx`insert into public.shortlist_links (role_id, token_hash, expires_at, created_by)
             values (${roleId}, ${hash}, now() + ${`${SHORTLIST_DAYS} days`}::interval, ${user.id})`;
    return true;
  });
  if (!ready) return { message: 'No candidate has confirmed interest yet, so there is nothing to share.' };
  revalidatePath(`/platform/talent/roles/${roleId}`);
  return { ok: true, url: `${env.appUrl}/shortlist/${token}`, message: `Link created. It works for ${SHORTLIST_DAYS} days. Copy it now: it is shown only once.` };
}

export async function revokeShortlistLink(roleId: string, linkId: string): Promise<void> {
  const user = await requirePlatformAdmin();
  await withUser(user.id, (tx) => tx`update public.shortlist_links set revoked_at = now() where id = ${linkId} and revoked_at is null`);
  revalidatePath(`/platform/talent/roles/${roleId}`);
}

export async function setVerified(userId: string, verified: boolean): Promise<void> {
  const user = await requirePlatformAdmin();
  await withUser(user.id, (tx) => tx`select app.set_passport_verified(${userId}, ${verified})`);
  revalidatePath('/platform/talent', 'layout');
}
