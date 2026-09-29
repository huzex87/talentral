'use server';
import { z } from 'zod';
import { withUser } from '@talentral/db';
import { NIGERIAN_STATES, normalisePhone } from '@talentral/domain';
import { env } from '@/lib/env';
import { escapeHtml, layoutMail, sendMail } from '@/lib/mail';

export interface JoinState { ok?: boolean; message?: string; errors?: Record<string, string>; values?: Record<string, string> }

const schema = z.object({
  hub: z.string().trim().min(2, 'Enter your hub or organisation name.').max(160),
  contact: z.string().trim().min(2, 'Enter your name.').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254),
  phone: z.string().trim().refine((p) => Boolean(normalisePhone(p)), 'Enter a valid phone number, for example 0803 123 4567.'),
  state: z.string().refine((s) => s === '' || (NIGERIAN_STATES as readonly string[]).includes(s), 'Choose a state.'),
  size: z.string().max(40),
  message: z.string().trim().max(2000),
});

// "I run a hub": a hub registers interest; platform admins are told by email and follow up.
export async function submitJoin(_prev: JoinState, form: FormData): Promise<JoinState> {
  if (String(form.get('website') ?? '')) return { ok: true, message: 'Thank you. We will be in touch.' }; // bots fill hidden fields
  const values = Object.fromEntries(['hub', 'contact', 'email', 'phone', 'state', 'size', 'message'].map((k) => [k, String(form.get(k) ?? '')]));
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors, values, message: 'Please check the highlighted fields.' };
  }
  const d = parsed.data;
  try {
    await withUser(null, (tx) => tx`select app.submit_hub_lead(${d.hub}, ${d.contact}, ${d.email}, ${normalisePhone(d.phone)!}, ${d.state}, ${d.size}, ${d.message})`);
  } catch (e) {
    if ((e as { code?: string }).code === 'P0001') return { values, message: 'We already have your enquiry. We will be in touch soon.' };
    throw e;
  }

  const admins = (process.env.PLATFORM_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean);
  const rows = [['Hub', d.hub], ['Contact', d.contact], ['Email', d.email], ['Phone', normalisePhone(d.phone)!], ['State', d.state || 'Not given'], ['Expected cohort size', d.size || 'Not given'], ['Message', d.message || 'None']];
  await Promise.all(admins.map((to) => sendMail({ to, replyTo: d.email, subject: `New hub enquiry: ${d.hub}`, ...layoutMail({
    heading: `${d.hub} wants to join Talentral`,
    paragraphs: rows.map(([k, v]) => `<b>${escapeHtml(k!)}:</b> ${escapeHtml(v!).replace(/\n/g, '<br>')}`),
    button: { label: 'Open the platform console', url: `${env.appUrl}/platform` },
    footnote: 'Reply to this email to reach the hub directly.',
  }) }).catch((e) => console.error('lead email failed', e))));

  return { ok: true, message: `Thank you, ${d.contact.split(' ')[0]}. We have received ${d.hub}'s enquiry and will contact you within two working days.` };
}
