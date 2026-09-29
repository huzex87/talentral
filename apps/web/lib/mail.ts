// Outgoing email. Drivers: console (development), file (tests read .mail/*.json), resend (production).
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NotifiedStatus } from '@talentral/domain';
import { env } from './env';

// replyTo lets applicants answer the hub directly instead of the no-reply address.
export interface Mail { to: string; subject: string; html: string; text: string; replyTo?: string }

const resendBody = (m: Mail) => ({ from: env.mailFrom, to: [m.to], subject: m.subject, html: m.html, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}) });

export async function sendMail(mail: Mail): Promise<void> {
  if (env.mailDriver === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(resendBody(mail)),
    });
    if (!res.ok) throw new Error(`Email failed (${res.status}): ${await res.text()}`);
    return;
  }
  if (env.mailDriver === 'file') {
    const dir = join(process.cwd(), '.mail');
    await mkdir(dir, { recursive: true });
    const safe = mail.to.replace(/[^a-z0-9@._-]/gi, '_');
    await writeFile(join(dir, `${Date.now()}-${randomBytes(3).toString('hex')}-${safe}.json`), JSON.stringify(mail, null, 2));
    return;
  }
  console.info(`\n[mail] to ${mail.to}: ${mail.subject}\n${mail.text}\n`);
}

// Many messages at once: Resend's batch endpoint takes 100 per request, which keeps a bulk send of
// hundreds of applicants well inside rate limits and function time. Returns how many were accepted.
export async function sendMailBatch(mails: Mail[]): Promise<number> {
  if (env.mailDriver !== 'resend') {
    for (const m of mails) await sendMail(m);
    return mails.length;
  }
  let sent = 0;
  for (let i = 0; i < mails.length; i += 100) {
    const chunk = mails.slice(i, i + 100);
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk.map(resendBody)),
    });
    if (res.ok) sent += chunk.length;
    else console.error(`Batch email failed (${res.status}): ${await res.text()}`);
  }
  return sent;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// One branded layout for every message: plain, readable on phones, no remote images.
function layout(opts: { heading: string; paragraphs: string[]; button?: { label: string; url: string }; footnote?: string; hub?: string }) {
  const { heading, paragraphs, button, footnote, hub } = opts;
  const html = `<!doctype html><html><body style="margin:0;background:#F7F8FC;font-family:Arial,Helvetica,sans-serif;color:#101733">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FC;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E3E7F2;border-radius:14px">
<tr><td style="height:5px;background:linear-gradient(90deg,#7C3AED,#2E5BFF,#14B8A6);border-radius:14px 14px 0 0"></td></tr>
<tr><td style="padding:26px 28px 8px"><div style="font-size:13px;font-weight:bold;letter-spacing:.08em;color:#7C3AED;text-transform:uppercase">${esc(hub ?? 'Talentral')}</div>
<h1 style="font-size:22px;line-height:1.3;margin:10px 0 6px">${esc(heading)}</h1></td></tr>
<tr><td style="padding:0 28px 8px;font-size:15px;line-height:1.6;color:#3A4466">${paragraphs.map((p) => `<p style="margin:0 0 14px">${p}</p>`).join('')}</td></tr>
${button ? `<tr><td style="padding:4px 28px 22px"><a href="${esc(button.url)}" style="display:inline-block;background:#2E5BFF;color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 20px;border-radius:10px">${esc(button.label)}</a></td></tr>` : ''}
${footnote ? `<tr><td style="padding:0 28px 24px;font-size:12.5px;line-height:1.5;color:#5B6482">${footnote}</td></tr>` : ''}
</table><p style="font-size:12px;color:#5B6482;margin:14px 0 0">Sent by Talentral · Verified skills. Real work.</p></td></tr></table></body></html>`;
  const strip = (s: string) => s.replace(/<[^>]+>/g, '');
  const text = [heading, '', ...paragraphs.map(strip), ...(button ? ['', `${button.label}: ${button.url}`] : []), ...(footnote ? ['', strip(footnote)] : [])].join('\n');
  return { html, text };
}

export function signInMail(to: string, url: string): Mail {
  return { to, subject: 'Your Talentral sign-in link', ...layout({
    heading: 'Sign in to Talentral',
    paragraphs: ['Use the button below to sign in. The link works once and expires in 15 minutes.'],
    button: { label: 'Sign in', url },
    footnote: 'If you did not ask to sign in, you can ignore this email.',
  }) };
}

export function inviteMail(to: string, hubName: string, role: string, url: string, inviter: string | null): Mail {
  return { to, subject: `You're invited to manage ${hubName} on Talentral`, ...layout({
    hub: hubName,
    heading: `Join ${hubName} on Talentral`,
    paragraphs: [
      `${esc(inviter ?? 'The Talentral team')} has invited you to join <b>${esc(hubName)}</b> as ${role === 'owner' ? 'an owner' : `a ${esc(role)}`}.`,
      role === 'owner'
        ? 'After you accept, set up your hub profile (logo, colours and description) and open your first call for applications.'
        : 'After you accept, you can see and review your hub\'s applications.',
    ],
    button: { label: 'Accept invitation', url },
    footnote: 'This invitation expires in 7 days.',
  }) };
}

export function applicationReceivedMail(to: string, name: string, hubName: string, programme: string, reference: string): Mail {
  return { to, subject: `Application received: ${programme} (${reference})`, ...layout({
    hub: hubName,
    heading: 'We have received your application',
    paragraphs: [
      `Dear ${esc(name)},`,
      `Thank you for applying to <b>${esc(programme)}</b> at ${esc(hubName)}. Your reference number is <b>${esc(reference)}</b>. Please keep it for any questions about your application.`,
      `${esc(hubName)} will contact you by email or phone about the next steps.`,
    ],
    footnote: 'You received this email because you applied through Talentral. Your information is handled under the Nigeria Data Protection Act 2023.',
  }) };
}


export function statusChangeMail(status: NotifiedStatus, a: { to: string; name: string; hubName: string; programme: string; reference: string; replyTo?: string | null }): Mail {
  const hello = `Dear ${esc(a.name)},`;
  const prog = `<b>${esc(a.programme)}</b>`;
  const ref = `Reference: <b>${esc(a.reference)}</b>`;
  const copy: Record<NotifiedStatus, { subject: string; heading: string; paragraphs: string[] }> = {
    shortlisted: {
      subject: `You have been shortlisted: ${a.programme}`,
      heading: 'Good news: you have been shortlisted',
      paragraphs: [hello, `Your application to ${prog} at ${esc(a.hubName)} has been shortlisted.`,
        `${esc(a.hubName)} will contact you soon about the next step, such as an interview or assessment. Please keep your phone on and check your email.`, ref],
    },
    offered: {
      subject: `You are offered a place: ${a.programme}`,
      heading: 'Congratulations: you are offered a place',
      paragraphs: [hello, `${esc(a.hubName)} is pleased to offer you a place on ${prog}.`,
        `Please reply to this email to confirm that you accept the place. ${esc(a.hubName)} will then share the start date and what to bring.`, ref],
    },
    accepted: {
      subject: `Your place is confirmed: ${a.programme}`,
      heading: 'Your place is confirmed',
      paragraphs: [hello, `Your place on ${prog} at ${esc(a.hubName)} is confirmed. Welcome aboard.`,
        `${esc(a.hubName)} will send your schedule and joining details before the programme starts.`, ref],
    },
    rejected: {
      subject: `Update on your application: ${a.programme}`,
      heading: 'An update on your application',
      paragraphs: [hello, `Thank you for applying to ${prog} at ${esc(a.hubName)}. We received many strong applications and, after careful review, we are unable to offer you a place this time.`,
        `Please do not be discouraged. We encourage you to apply again for future programmes.`, ref],
    },
  };
  const c = copy[status];
  return { to: a.to, subject: c.subject, replyTo: a.replyTo ?? undefined, ...layout({
    hub: a.hubName, heading: c.heading, paragraphs: c.paragraphs,
    footnote: 'You received this email because you applied through Talentral. Your information is handled under the Nigeria Data Protection Act 2023.',
  }) };
}
