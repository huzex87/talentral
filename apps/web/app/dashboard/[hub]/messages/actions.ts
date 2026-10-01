'use server';
import { revalidatePath } from 'next/cache';
import { withUser } from '@talentral/db';
import { MAX_SMS_SEGMENTS, normalisePhone, personalise, smsSegments, waPhone } from '@talentral/domain';
import { requireHubRole } from '@/lib/auth';
import { escapeHtml, layoutMail, sendMailBatch } from '@/lib/mail';
import { sendTexts, textingEnabled } from '@/lib/texts';
import { readFilters, whereClause } from '../applications/query';

const MAX_RECIPIENTS = 5000;

export interface Audience { total: number; withPhone: number; onWhatsApp: number }
export interface SendState { ok?: boolean; message?: string; errors?: Record<string, string> }

type Recipient = { email: string; full_name: string; phone: string; reference: string; programme: string; hub: string; contact_email: string | null };

async function recipients(slug: string, filters: string) {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const f = readFilters(Object.fromEntries(new URLSearchParams(filters)));
  const rows = await withUser(user.id, (tx) => tx<Recipient[]>`
    select a.email, a.full_name, a.phone, a.reference, p.title as programme, t.name as hub, t.contact_email
    from public.applications a join public.programmes p on p.id = a.programme_id join public.tenants t on t.id = a.tenant_id
    where ${whereClause(tx, hub.id, f)} and a.status <> 'withdrawn'
    order by a.submitted_at limit ${MAX_RECIPIENTS + 1}`);
  return { user, hub, f, rows };
}

// Which recipients chose WhatsApp (only numbers that applied to this hub).
async function whatsappSet(userId: string, hubId: string, rows: Recipient[]): Promise<Set<string>> {
  const phones = rows.map((r) => r.phone).filter(Boolean);
  if (!phones.length) return new Set();
  const found = await withUser(userId, (tx) => tx<{ phone: string }[]>`select * from app.whatsapp_audience(${hubId}, ${phones}::text[]) as phone`);
  return new Set(found.map((r) => r.phone));
}

// Live count for the compose screen: who the current audience reaches, and by which channel.
export async function countAudience(slug: string, filters: string): Promise<Audience> {
  const { user, hub, rows } = await recipients(slug, filters);
  const optedIn = await whatsappSet(user.id, hub.id, rows);
  return { total: rows.length, withPhone: rows.filter((r) => normalisePhone(r.phone)).length, onWhatsApp: rows.filter((r) => { const n = waPhone(r.phone); return n && optedIn.has(n); }).length };
}

export async function sendMessage(slug: string, _prev: SendState, form: FormData): Promise<SendState> {
  const channels = ['email', 'sms'].filter((c) => form.get(`channel.${c}`) === 'on');
  const subject = String(form.get('subject') ?? '').trim().slice(0, 160);
  const body = String(form.get('body') ?? '').trim();
  const sms = String(form.get('sms') ?? '').trim();
  const filters = String(form.get('audience') ?? '');

  const errors: Record<string, string> = {};
  if (!channels.length) errors.channels = 'Choose email, SMS or both.';
  if (channels.includes('email')) {
    if (subject.length < 3) errors.subject = 'Add a subject.';
    if (body.length < 5) errors.body = 'Write the email.';
    if (body.length > 5000) errors.body = 'Keep the email under 5,000 characters.';
  }
  if (channels.includes('sms')) {
    if (sms.length < 5) errors.sms = 'Write the text message.';
    else if (smsSegments(sms).segments > MAX_SMS_SEGMENTS) errors.sms = `Keep the text to ${MAX_SMS_SEGMENTS} SMS or fewer.`;
    if (!textingEnabled()) errors.sms = 'Text messages are not set up yet. Ask Talentral to connect WhatsApp or an SMS sender.';
  }
  if (Object.keys(errors).length) return { errors, message: 'Please check the highlighted fields.' };

  const { user, hub, f, rows } = await recipients(slug, filters);
  if (!rows.length) return { message: 'Nobody matches this audience.' };
  if (rows.length > MAX_RECIPIENTS) return { message: `Send to at most ${MAX_RECIPIENTS.toLocaleString()} people at once. Narrow the audience.` };

  const [msg] = await withUser(user.id, (tx) => tx<{ id: string }[]>`
    insert into public.messages (tenant_id, author_id, channels, subject, body, audience, recipients)
    values (${hub.id}, ${user.id}, ${channels}, ${channels.includes('email') ? subject : null},
            ${channels.includes('email') ? body : sms}, ${tx.json({ ...f, page: undefined, sms: channels.includes('sms') ? sms : undefined } as never)}, ${rows.length})
    returning id`);

  let emailed = 0;
  let texted = 0;
  let whatsapp = 0;
  if (channels.includes('email')) {
    emailed = await sendMailBatch(rows.map((r) => {
      const paragraphs = personalise(body, r).split(/\n{2,}/).map((p) => escapeHtml(p).replace(/\n/g, '<br>'));
      return { to: r.email, subject: personalise(subject, r), replyTo: r.contact_email ?? undefined, ...layoutMail({ hub: r.hub, heading: personalise(subject, r), paragraphs,
        footnote: `You received this message because you applied to ${escapeHtml(r.programme)} through Talentral. Reply to this email to reach ${escapeHtml(r.hub)}.` }) };
    })).catch((e) => { console.error('bulk email failed', e); return 0; });
  }
  if (channels.includes('sms')) {
    const optedIn = await whatsappSet(user.id, hub.id, rows);
    const sent = await sendTexts(rows.flatMap((r) => {
      const to = normalisePhone(r.phone);
      return to ? [{ phone: to, language: 'en' as const, hub: r.hub, text: personalise(sms, r) }] : [];
    }), optedIn);
    texted = sent.sms;
    whatsapp = sent.whatsapp;
  }

  await withUser(user.id, async (tx) => {
    await tx`update public.messages set emailed = ${emailed}, texted = ${texted}, whatsapp = ${whatsapp} where id = ${msg!.id}`;
    await tx`select app.audit(${hub.id}, 'message.sent', 'message', ${msg!.id}, ${tx.json({ channels, recipients: rows.length, emailed, texted, whatsapp })})`;
  });
  revalidatePath(`/dashboard/${slug}/messages`);
  const parts = [channels.includes('email') && `${emailed} emailed`, channels.includes('sms') && whatsapp > 0 && `${whatsapp} on WhatsApp`, channels.includes('sms') && `${texted} by SMS`].filter(Boolean);
  return { ok: true, message: `Sent to ${rows.length} ${rows.length === 1 ? 'person' : 'people'}: ${parts.join(', ')}.` };
}
