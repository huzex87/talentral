'use server';
// Talent officer actions: employers, roles, candidates, placements and shortlist links.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { withUser } from '@talentral/db';
import { CANDIDATE_STAGES, EMPLOYER_STAGES, JOB_TYPES, NIGERIAN_STATES, SHORTLIST_DAYS, WORK_MODES, cleanSkills } from '@talentral/domain';
import { requirePlatformAdmin } from '@/lib/auth';
import { env } from '@/lib/env';
import { confirmHireMail, employerStatusMail, invoiceIssuedMail, sendMail, shortlistSentMail } from '@/lib/mail';
import { formatDate } from '@/lib/format';
import { invoiceIssuer } from '@/lib/invoice-issuer';
import { naira } from '@talentral/domain';
import { issueReplyLink, notifyCandidate } from '@/lib/work';
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
    const added = await tx<{ id: string }[]>`insert into public.role_candidates (role_id, user_id, added_by) values (${roleId}, ${userId}, ${user.id})
                           on conflict (role_id, user_id) do nothing returning id`;
    if (!added.length) return { message: `${person.full_name ?? 'This person'} is already on this role.` };
    return { ok: true, person, role, url: await issueReplyLink(tx, added[0]!.id) };
  });
  // They answer from the email or a WhatsApp or SMS message, in one tap, without signing in.
  if ('url' in result && result.url) await notifyCandidate(userId, { role: result.role!.title, employer: result.role!.employer, url: result.url, invited: false });
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
  const ask = await withUser(user.id, async (tx) => {
    const [before] = await tx<{ stage: string; role_id: string }[]>`select stage, role_id from public.role_candidates where id = ${candidateId}`;
    await tx`
      update public.role_candidates set stage = ${d.stage}, notes = ${d.notes || null}, placement_type = ${d.placement_type || null},
        start_date = ${d.start_date || null}, pay_band = ${d.pay_band || null}
      where id = ${candidateId}`;
    if (!before || before.stage === 'placed' || d.stage !== 'placed') return null;
    // A new hire recorded by the talent team: ask the employer's own team to confirm it.
    const [info] = await tx<{ employer: string; role: string; person: string; emails: string[] }[]>`
      select e.name as employer, r.title as role, coalesce(u.full_name, 'the candidate') as person,
        coalesce((select array_agg(distinct mu.email::text) from public.employer_members m join public.users mu on mu.id = m.user_id where m.employer_id = e.id), '{}') as emails
      from public.role_candidates c join public.job_roles r on r.id = c.role_id join public.employers e on e.id = r.employer_id join public.users u on u.id = c.user_id
      where c.id = ${candidateId}`;
    return info ? { ...info, roleId: before.role_id } : null;
  });
  if (ask) {
    await Promise.all(ask.emails.map((to) => sendMail(confirmHireMail(to, ask.employer, ask.person, ask.role, formatDay(d.start_date), `${env.appUrl}/employer/jobs/${ask.roleId}`))
      .catch((e) => console.error('confirm hire email failed', e))));
  }
  revalidatePath('/platform/talent', 'layout');
  return { ok: true, message: d.stage === 'placed' ? (ask?.emails.length ? 'Placement recorded. We asked the employer to confirm it.' : 'Placement recorded. Confirm it from Placements once the employer agrees.') : 'Saved.' };
}

const formatDay = (d: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));

const noteSchema = z.string().trim().min(10, 'Say how you know, in a few words (10 characters or more).').max(500);

// The talent team confirms a hire on the employer's behalf, saying how the employer confirmed it.
export async function confirmPlacementOfficer(candidateId: string, _prev: TalentState, form: FormData): Promise<TalentState> {
  const user = await requirePlatformAdmin();
  const note = noteSchema.safeParse(String(form.get('note') ?? ''));
  if (!note.success) return { errors: { note: note.error.issues[0]!.message } };
  const [r] = await withUser(user.id, (tx) => tx<{ ok: boolean }[]>`select app.confirm_placement(${candidateId}, ${note.data}) as ok`);
  if (!r?.ok) return { message: 'This placement is no longer recorded.' };
  revalidatePath('/platform/talent', 'layout');
  return { ok: true, message: 'Hire confirmed.' };
}

// The talent team records the 90-day answer when the employer has not given it.
export async function recordRetentionOfficer(candidateId: string, _prev: TalentState, form: FormData): Promise<TalentState> {
  const user = await requirePlatformAdmin();
  const retained = String(form.get('retained') ?? '');
  if (retained !== 'yes' && retained !== 'no') return { errors: { retained: 'Choose whether they are still in the job.' } };
  const note = noteSchema.safeParse(String(form.get('note') ?? ''));
  if (!note.success) return { errors: { note: note.error.issues[0]!.message } };
  try {
    const [r] = await withUser(user.id, (tx) => tx<{ ok: boolean }[]>`select app.record_retention(${candidateId}, ${retained === 'yes'}, ${note.data}) as ok`);
    if (!r?.ok) return { message: 'This placement is no longer recorded.' };
  } catch (e) {
    return { message: /90 days/.test(e instanceof Error ? e.message : '') ? 'The 90-day check opens 90 days after the start date.' : 'We could not save it. Please try again.' };
  }
  revalidatePath('/platform/talent', 'layout');
  return { ok: true, message: '90-day check recorded.' };
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

// Sends the shortlist: the employer's team is emailed a link to the job page, where the people who
// said yes are listed with their contact details. An employer without a Talentral account gets a
// private shortlist link instead, sent to its contact address.
export async function sendShortlist(roleId: string): Promise<TalentState> {
  const user = await requirePlatformAdmin();
  if (!/^[0-9a-f-]{36}$/.test(roleId)) return { message: 'Role not found.' };
  let result: { n: number; title: string; employer: string; emails: string[]; contact: string | null; token: string | null };
  try {
    result = await withUser(user.id, async (tx) => {
      const [n] = await tx<{ n: number }[]>`select app.send_shortlist(${roleId}) as n`;
      const [r] = await tx<{ title: string; employer: string; employer_id: string; contact: string | null }[]>`
        select r.title, e.name as employer, e.id as employer_id, e.contact_email::text as contact from public.job_roles r join public.employers e on e.id = r.employer_id where r.id = ${roleId}`;
      const emails = (await tx<{ email: string }[]>`select u.email::text from public.employer_members m join public.users u on u.id = m.user_id where m.employer_id = ${r!.employer_id}`).map((x) => x.email);
      let token: string | null = null;
      if (!emails.length && r!.contact) {
        const t = newToken();
        await tx`insert into public.shortlist_links (role_id, token_hash, expires_at, created_by) values (${roleId}, ${t.hash}, now() + ${`${SHORTLIST_DAYS} days`}::interval, ${user.id})`;
        token = t.token;
      }
      return { n: n!.n, title: r!.title, employer: r!.employer, emails, contact: r!.contact, token };
    });
  } catch (e) {
    return { message: (e as Error).message.includes('said yes') ? 'Nobody has said yes and shared their Passport yet, so there is nothing to send.' : 'Could not send the shortlist.' };
  }
  const url = result.token ? `${env.appUrl}/shortlist/${result.token}` : `${env.appUrl}/employer/jobs/${roleId}`;
  const to = result.emails.length ? result.emails : result.contact ? [result.contact] : [];
  await Promise.all(to.map((addr) => sendMail(shortlistSentMail(addr, result.employer, result.title, result.n, url)).catch((e) => console.error('shortlist email failed', e))));
  revalidatePath('/platform/talent', 'layout');
  return { ok: true, message: to.length ? `Shortlist of ${result.n} sent to ${to.join(', ')}.` : `Shortlist marked as sent (${result.n}). This employer has no email address; share the employer link by hand.` };
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

// Verifying an employer lets it post jobs and search talent open to employers; pausing stops both.
export async function setEmployerStatus(employerId: string, status: 'verified' | 'suspended'): Promise<void> {
  const user = await requirePlatformAdmin();
  const members = await withUser(user.id, async (tx) => {
    const rows = await tx<{ name: string }[]>`update public.employers set status = ${status}, verified_at = case when ${status} = 'verified' then coalesce(verified_at, now()) else verified_at end
      where id = ${employerId} returning name`;
    if (!rows.length) return [];
    const emails = await tx<{ email: string }[]>`select u.email::text from public.employer_members m join public.users u on u.id = m.user_id where m.employer_id = ${employerId}`;
    return emails.map((e) => ({ email: e.email, name: rows[0]!.name }));
  });
  await Promise.all(members.map((m) => sendMail(employerStatusMail(m.email, m.name, status, `${env.appUrl}/employer`)).catch((e) => console.error('employer status email failed', e))));
  revalidatePath('/platform/talent', 'layout');
}

// The verification decision on a self-registered employer: verify, reject with a reason the employer
// sees and can act on, or pause. Every member of the organisation is emailed.
export async function reviewEmployer(employerId: string, decision: 'verified' | 'rejected' | 'suspended', _prev: TalentState, form: FormData): Promise<TalentState> {
  const user = await requirePlatformAdmin();
  const note = String(form.get('note') ?? '').trim().slice(0, 1000);
  if (decision !== 'verified' && note.length < 10) return { errors: { note: 'Tell the employer what to fix, in at least 10 characters.' } };
  let members: { email: string; name: string }[] = [];
  try {
    members = await withUser(user.id, async (tx) => {
      await tx`select app.review_employer(${employerId}, ${decision}, ${note || null})`;
      return tx<{ email: string; name: string }[]>`
        select u.email::text, e.name from public.employer_members m join public.users u on u.id = m.user_id join public.employers e on e.id = m.employer_id
        where m.employer_id = ${employerId}`;
    });
  } catch {
    return { message: 'We could not save the decision. Please try again.' };
  }
  await Promise.all(members.map((m) => sendMail(employerStatusMail(m.email, m.name, decision, `${env.appUrl}/employer`, note || null)).catch((e) => console.error('employer status email failed', e))));
  revalidatePath('/platform/talent', 'layout');
  return { ok: true, message: decision === 'verified' ? 'Verified. The employer has been emailed and can now post jobs.' : decision === 'rejected' ? 'Sent back with your note. The employer can update their details and ask again.' : 'Paused. The employer has been emailed.' };
}

// A talent officer checks a portfolio item (the link works, the work is theirs) and marks it verified.
export async function verifyPortfolioItem(personId: string, itemId: string, on: boolean): Promise<void> {
  const user = await requirePlatformAdmin();
  await withUser(user.id, (tx) => tx`select app.verify_portfolio_item(${itemId}, ${on})`);
  revalidatePath(`/platform/talent/people/${personId}`);
}

// ---------------------------------------------------------------- placement invoices

const invoiceSchema = z.object({
  fee_type: z.enum(['percent', 'flat']),
  fee_percent: z.coerce.number().min(0).max(50).optional(),
  annual_pay: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  flat: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  vat_percent: z.coerce.number().min(0).max(20).default(0),
  due_days: z.coerce.number().int().min(0).max(90).default(14),
});

// Issues the invoice for a confirmed hire and emails it to the employer's team (or its contact).
export async function issueInvoice(candidateId: string, _prev: TalentState, form: FormData): Promise<TalentState> {
  const user = await requirePlatformAdmin();
  if (!/^[0-9a-f-]{36}$/.test(candidateId)) return { message: 'Placement not found.' };
  const blank = (k: string) => (String(form.get(k) ?? '').trim() === '' ? undefined : String(form.get(k)).replace(/[,\s₦]/g, ''));
  const parsed = invoiceSchema.safeParse({ fee_type: form.get('fee_type'), fee_percent: blank('fee_percent'), annual_pay: blank('annual_pay'), flat: blank('flat'),
    vat_percent: blank('vat_percent') ?? 0, due_days: blank('due_days') ?? 14 });
  if (!parsed.success) return { message: 'Check the fee details: percentages up to 50, VAT up to 20, whole naira amounts.' };
  const d = parsed.data;
  let made: { id: string; number: string; total: string; due_on: string; employer: string; role: string; person: string; to: string[]; account: boolean };
  try {
    made = await withUser(user.id, async (tx) => {
      const [issued] = await tx<{ id: string }[]>`select app.issue_placement_invoice(${candidateId}, ${d.fee_type}, ${d.fee_type === 'percent' ? d.fee_percent ?? null : null},
        ${d.fee_type === 'percent' ? d.annual_pay ?? null : null}, ${d.fee_type === 'flat' ? d.flat ?? null : null}, ${d.vat_percent}, ${d.due_days}) as id`;
      const id = issued!.id;
      const [inv] = await tx<{ number: string; total: string; due_on: string; employer_name: string; role_title: string; candidate_name: string; employer_id: string; contact: string | null }[]>`
        select i.number, i.total::text, i.due_on::text, i.employer_name, i.role_title, i.candidate_name, i.employer_id, e.contact_email::text as contact
        from public.placement_invoices i join public.employers e on e.id = i.employer_id where i.id = ${id}`;
      const members = (await tx<{ email: string }[]>`select u.email::text from public.employer_members m join public.users u on u.id = m.user_id where m.employer_id = ${inv!.employer_id}`).map((r) => r.email);
      return { id, number: inv!.number, total: inv!.total, due_on: inv!.due_on, employer: inv!.employer_name, role: inv!.role_title, person: inv!.candidate_name,
        to: members.length ? members : inv!.contact ? [inv!.contact] : [], account: members.length > 0 };
    });
  } catch (e) {
    const m = (e as Error).message;
    return { message: /Record the hire|between|Enter|Choose/.test(m) ? m.replace(/^.*?: /, '') + '.' : /duplicate/.test(m) ? 'This placement already has an invoice.' : 'Could not issue the invoice.' };
  }
  // Employers with a Talentral account open the invoice there; others get the payment details by email.
  const bank = invoiceIssuer().bank;
  const url = made.account ? `${env.appUrl}/employer/invoices/${made.id}` : null;
  await Promise.all(made.to.map((addr) => sendMail(invoiceIssuedMail(addr, made.employer, made.number, naira(Number(made.total)), formatDate(made.due_on), made.role, made.person, url, bank))
    .catch((e) => console.error('invoice email failed', e))));
  revalidatePath('/platform/talent', 'layout');
  redirect(`/platform/talent/invoices/${made.id}?issued=1`);
}

export async function setInvoiceStatus(invoiceId: string, status: 'issued' | 'paid' | 'waived' | 'void', _prev: TalentState, form: FormData): Promise<TalentState> {
  const user = await requirePlatformAdmin();
  if (!/^[0-9a-f-]{36}$/.test(invoiceId)) return { message: 'Invoice not found.' };
  const reference = String(form.get('reference') ?? '').trim().slice(0, 120) || null;
  const note = String(form.get('note') ?? '').trim().slice(0, 500) || null;
  try {
    await withUser(user.id, (tx) => tx`select app.set_invoice_status(${invoiceId}, ${status}, ${reference}, ${note})`);
  } catch (e) {
    return { message: /at least 5/.test((e as Error).message) ? 'Give a reason of at least 5 characters.' : 'Could not update the invoice.' };
  }
  revalidatePath('/platform/talent', 'layout');
  return { ok: true, message: status === 'paid' ? 'Recorded as paid.' : status === 'issued' ? 'Reopened.' : status === 'waived' ? 'Waived.' : 'Voided.' };
}
