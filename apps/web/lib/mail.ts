// Outgoing email. Drivers: console (development), file (tests read .mail/*.json), resend (production).
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from './env';

export interface Mail { to: string; subject: string; html: string; text: string }

export async function sendMail(mail: Mail): Promise<void> {
  if (env.mailDriver === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.mailFrom, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
    });
    if (!res.ok) throw new Error(`Email failed (${res.status}): ${await res.text()}`);
    return;
  }
  if (env.mailDriver === 'file') {
    const dir = join(process.cwd(), '.mail');
    await mkdir(dir, { recursive: true });
    const safe = mail.to.replace(/[^a-z0-9@._-]/gi, '_');
    await writeFile(join(dir, `${Date.now()}-${safe}.json`), JSON.stringify(mail, null, 2));
    return;
  }
  console.info(`\n[mail] to ${mail.to}: ${mail.subject}\n${mail.text}\n`);
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
