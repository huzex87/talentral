'use server';
import { allowFromAddress, TOO_MANY } from '@/lib/rate';
import { z } from 'zod';
import { withUser } from '@talentral/db';
import { NIGERIAN_STATES, normalisePhone } from '@talentral/domain';
import { requestSignIn } from '@/lib/auth';
import { adminEmails } from '@/lib/employer';
import { env } from '@/lib/env';
import { escapeHtml, layoutMail, sendMail } from '@/lib/mail';

export interface RegisterState { ok?: boolean; message?: string; errors?: Record<string, string>; values?: Record<string, string> }

const optionalUrl = z.string().trim().max(300).refine((v) => v === '' || /^https?:\/\/\S+\.\S+/.test(v), 'Enter a full web address starting with https://');
const schema = z.object({
  name: z.string().trim().min(2, 'Enter your organisation name.').max(160),
  sector: z.string().trim().min(2, 'Tell us your sector.').max(80),
  website: optionalUrl,
  state: z.string().refine((s) => s === '' || (NIGERIAN_STATES as readonly string[]).includes(s), 'Choose a state.'),
  size: z.enum(['1-10', '11-50', '51-200', '201+'], { message: 'Choose your team size.' }),
  contact_name: z.string().trim().min(2, 'Enter your name.').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid work email address.').max(160),
  phone: z.string().trim().refine((p) => Boolean(normalisePhone(p)), 'Enter a valid phone number, for example 0803 123 4567.'),
  hiring: z.string().trim().min(5, 'Tell us the roles you hire for.').max(2000),
});
const KEYS = ['name', 'sector', 'website', 'state', 'size', 'contact_name', 'email', 'phone', 'hiring'];

// Registers an employer as pending, emails a sign-in link, and alerts the talent team to verify it.
export async function registerEmployer(_prev: RegisterState, form: FormData): Promise<RegisterState> {
  if (String(form.get('company_url') ?? '')) return { ok: true, message: 'Thank you. Check your email.' }; // bots fill hidden fields
  if (!(await allowFromAddress('enquiry'))) return { message: TOO_MANY.en };
  const values = Object.fromEntries(KEYS.map((k) => [k, String(form.get(k) ?? '')]));
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors, values, message: 'Please check the highlighted fields.' };
  }
  const d = parsed.data;
  if (!form.get('terms')) return { values, errors: { terms: 'Confirm you will use candidate information only to recruit.' } };
  const phone = normalisePhone(d.phone)!;
  try {
    await withUser(null, (tx) => tx`select app.register_employer(${d.name}, ${d.sector}, ${d.website}, ${d.state}, ${d.size}, ${d.contact_name}, ${d.email}, ${phone}, ${d.hiring})`);
  } catch (e) {
    if ((e as { code?: string }).code === 'P0001') return { values, message: 'We already have registrations from this email today. Check your inbox for a sign-in link.' };
    throw e;
  }
  await requestSignIn(d.email);
  const rows = [['Organisation', d.name], ['Sector', d.sector], ['Website', d.website || 'None'], ['State', d.state || 'Not given'], ['Team size', d.size],
    ['Contact', `${d.contact_name}, ${d.email}, ${phone}`], ['Hiring for', d.hiring]];
  await Promise.all(adminEmails().map((to) => sendMail({ to, replyTo: d.email, subject: `Employer to verify: ${d.name}`, ...layoutMail({
    heading: `${d.name} registered as an employer`,
    paragraphs: [...rows.map(([k, v]) => `<b>${escapeHtml(k!)}:</b> ${escapeHtml(v!).replace(/\n/g, '<br>')}`),
      'Check the organisation is real (website, CAC number or a quick call) before verifying it. Until then it cannot post jobs or search talent.'],
    button: { label: 'Review in the talent console', url: `${env.appUrl}/platform/talent/employers` },
  }) }).catch((e) => console.error('employer alert failed', e))));
  return { ok: true, message: `Thank you, ${d.contact_name.split(' ')[0]}. We have emailed ${d.email} a sign-in link. Our talent team will verify ${d.name}, usually within one working day, and you can then post jobs.` };
}
