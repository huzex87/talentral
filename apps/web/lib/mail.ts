// Outgoing email. Drivers: console (development), file (tests read .mail/*.json), resend (production).
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { brandedFrom, type NotifiedStatus } from '@talentral/domain';
import { env } from './env';

// replyTo lets applicants answer the hub directly instead of the no-reply address.
// from is set for white-label hub emails ("Kirkira Hub via Talentral"); otherwise Talentral's own.
export interface Mail { to: string; subject: string; html: string; text: string; replyTo?: string; from?: string }

const resendBody = (m: Mail) => ({ from: m.from ?? env.mailFrom, to: [m.to], subject: m.subject, html: m.html, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}) });

// A hub's email branding (MVP-2 month 9): its name, colour and logo in the email, its sender name,
// where replies go and a footer line. Hub emails take this or just the hub's name.
export interface HubBrand { name: string; color: string | null; logoUrl: string | null; fromName: string | null; replyTo: string | null; footer: string | null }
export type HubLike = string | HubBrand;
const nameOf = (h: HubLike) => (typeof h === 'string' ? h : h.name);

// Sends as the hub when it has branding: its name in the From line, replies to its address.
function asHub(hub: HubLike, mail: Mail): Mail {
  if (typeof hub === 'string') return mail;
  return { ...mail, from: brandedFrom(hub.fromName || hub.name, env.mailFrom), replyTo: mail.replyTo ?? hub.replyTo ?? undefined };
}

// The hub's colour for the bar and button when it is dark enough for white text; otherwise ours.
function buttonColour(color: string | null | undefined): string {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return '#2E5BFF';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return 1.05 / (lum + 0.05) >= 4.5 ? color : '#2E5BFF';
}

// Addresses at .invalid (a reserved domain, used by the demo academy in lib/demo.ts) never exist,
// so nothing is ever sent to them.
const deliverable = (m: Mail) => !/\.invalid$/i.test(m.to.trim());

export async function sendMail(mail: Mail): Promise<void> {
  if (!deliverable(mail)) return;
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
export async function sendMailBatch(all: Mail[]): Promise<number> {
  const mails = all.filter(deliverable);
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

export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const esc = escapeHtml;

// One branded layout for every message: plain and readable on phones. The only remote image is a
// hub's own logo in white-label emails, with its name as the alternative text.
// Paragraphs are HTML: escape anything that came from users before passing it in.
export function layoutMail(opts: { heading: string; paragraphs: string[]; button?: { label: string; url: string }; footnote?: string; hub?: HubLike }) {
  return layout(opts);
}

function layout(opts: { heading: string; paragraphs: string[]; button?: { label: string; url: string }; footnote?: string; hub?: HubLike }) {
  const { heading, paragraphs, button, footnote } = opts;
  const brand = opts.hub && typeof opts.hub !== 'string' ? opts.hub : null;
  const hub = opts.hub ? nameOf(opts.hub) : undefined;
  const accent = buttonColour(brand?.color);
  const bar = brand ? accent : 'linear-gradient(90deg,#7C3AED,#2E5BFF,#14B8A6)';
  const masthead = brand?.logoUrl
    ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.name)}" height="40" style="display:block;height:40px;max-width:220px;border:0">`
    : `<div style="font-size:13px;font-weight:bold;letter-spacing:.08em;color:${brand ? accent : '#7C3AED'};text-transform:uppercase">${esc(hub ?? 'Talentral')}</div>`;
  const signature = brand ? `${brand.footer ? `${esc(brand.footer)}<br>` : ''}Sent for ${esc(brand.name)} by Talentral` : 'Sent by Talentral · Verified skills. Real work.';
  const html = `<!doctype html><html><body style="margin:0;background:#F7F8FC;font-family:Arial,Helvetica,sans-serif;color:#101733">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FC;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E3E7F2;border-radius:14px">
<tr><td style="height:5px;background:${bar};border-radius:14px 14px 0 0"></td></tr>
<tr><td style="padding:26px 28px 8px">${masthead}
<h1 style="font-size:22px;line-height:1.3;margin:10px 0 6px">${esc(heading)}</h1></td></tr>
<tr><td style="padding:0 28px 8px;font-size:15px;line-height:1.6;color:#3A4466">${paragraphs.map((p) => `<p style="margin:0 0 14px">${p}</p>`).join('')}</td></tr>
${button ? `<tr><td style="padding:4px 28px 22px"><a href="${esc(button.url)}" style="display:inline-block;background:${accent};color:#FFFFFF;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 20px;border-radius:10px">${esc(button.label)}</a></td></tr>` : ''}
${footnote ? `<tr><td style="padding:0 28px 24px;font-size:12.5px;line-height:1.5;color:#5B6482">${footnote}</td></tr>` : ''}
</table><p style="font-size:12px;line-height:1.5;color:#5B6482;margin:14px 0 0">${signature}</p></td></tr></table></body></html>`;
  const strip = (s: string) => s.replace(/<[^>]+>/g, '');
  const text = [heading, '', ...paragraphs.map(strip), ...(button ? ['', `${button.label}: ${button.url}`] : []), ...(footnote ? ['', strip(footnote)] : []),
    ...(brand ? ['', ...(brand.footer ? [brand.footer] : []), `Sent for ${brand.name} by Talentral`] : [])].join('\n');
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
  return { to, subject: role === 'facilitator' ? `You're invited to teach with ${hubName} on Talentral` : `You're invited to manage ${hubName} on Talentral`, ...layout({
    hub: hubName,
    heading: `Join ${hubName} on Talentral`,
    paragraphs: [
      `${esc(inviter ?? 'The Talentral team')} has invited you to join <b>${esc(hubName)}</b> as ${role === 'owner' ? 'an owner' : `a ${esc(role)}`}.`,
      role === 'owner'
        ? 'After you accept, set up your hub profile (logo, colours and description) and open your first call for applications.'
        : role === 'facilitator'
          ? 'After you accept, you can see your hub\'s cohorts and classes, take registers, grade learners\' work and reply in cohort discussions.'
          : 'After you accept, you can see and review your hub\'s applications.',
    ],
    button: { label: 'Accept invitation', url },
    footnote: 'This invitation expires in 7 days.',
  }) };
}

export function applicationReceivedMail(to: string, name: string, hub: HubLike, programme: string, reference: string): Mail {
  const hubName = nameOf(hub);
  return asHub(hub, { to, subject: `Application received: ${programme} (${reference})`, ...layout({
    hub,
    heading: 'We have received your application',
    paragraphs: [
      `Dear ${esc(name)},`,
      `Thank you for applying to <b>${esc(programme)}</b> at ${esc(hubName)}. Your reference number is <b>${esc(reference)}</b>. Please keep it for any questions about your application.`,
      `${esc(hubName)} will contact you by email or phone about the next steps.`,
    ],
    footnote: 'You received this email because you applied through Talentral. Your information is handled under the Nigeria Data Protection Act 2023.',
  }) });
}


// `link` is the acceptance email's welcome link (welcomeLinks in lib/auth): one click opens the
// learner's account. Without it, the email points to the sign-in page.
export function statusChangeMail(status: NotifiedStatus, a: { to: string; name: string; hubName: string; programme: string; reference: string; replyTo?: string | null; brand?: HubBrand | null; link?: string }): Mail {
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
        `Your Talentral learner account is ready. Open it now to complete your Talentral Passport, the skills profile that employers see when you choose to share it.`,
        `When ${esc(a.hubName)} adds you to a class, your course, class times and announcements appear in the same place, and we email you.`, ref],
    },
    rejected: {
      subject: `Update on your application: ${a.programme}`,
      heading: 'An update on your application',
      paragraphs: [hello, `Thank you for applying to ${prog} at ${esc(a.hubName)}. We received many strong applications and, after careful review, we are unable to offer you a place this time.`,
        `Please do not be discouraged. We encourage you to apply again for future programmes.`, ref],
    },
  };
  const c = copy[status];
  const hub = a.brand ?? a.hubName;
  const accepted = status === 'accepted';
  return asHub(hub, { to: a.to, subject: c.subject, replyTo: a.replyTo ?? undefined, ...layout({
    hub, heading: c.heading, paragraphs: c.paragraphs,
    button: accepted ? { label: 'Open my learner account', url: a.link ?? `${env.appUrl}/sign-in` } : undefined,
    footnote: `${accepted ? `${a.link ? 'The button works once within 7 days. ' : ''}Later, sign in at ${esc(env.appUrl.replace(/^https?:\/\//, ''))}/sign-in with this email address or the phone number you applied with. ` : ''}You received this email because you applied through Talentral. Your information is handled under the Nigeria Data Protection Act 2023.`,
  }) });
}

// Sent when a hub adds learners to a cohort: their course is open (or opens on the start date).
export function enrolledMail(a: { to: string; name: string; hub: HubLike; cohort: string; programme: string; startsOn: string | null; link: string; replyTo?: string | null }): Mail {
  const hubName = nameOf(a.hub);
  return asHub(a.hub, { to: a.to, subject: `Start learning: ${a.programme}`, replyTo: a.replyTo ?? undefined, ...layout({
    hub: a.hub,
    heading: 'You are in. Your class is ready',
    paragraphs: [
      `Dear ${esc(a.name)},`,
      `${esc(hubName)} has added you to <b>${esc(a.cohort)}</b> for <b>${esc(a.programme)}</b>.${a.startsOn ? ` The class starts on <b>${esc(a.startsOn)}</b>.` : ''}`,
      'Open your learner account to see your course, class times and announcements. You can study on your phone, download lessons to study offline, and switch the app to Hausa.',
    ],
    button: { label: 'Start learning', url: a.link },
    footnote: `The button works once within 7 days. Later, sign in at ${esc(env.appUrl.replace(/^https?:\/\//, ''))}/sign-in with this email address or the phone number you applied with. You received this email because ${esc(hubName)} selected you for this programme on Talentral.`,
  }) });
}

export function certificateMail(to: string, name: string, hub: HubLike, url: string, serial: string, replyTo?: string | null, passportUrl?: string): Mail {
  const hubName = nameOf(hub);
  return asHub(hub, { to, subject: `Your certificate from ${hubName}`, replyTo: replyTo ?? undefined, ...layout({
    hub,
    heading: 'Congratulations, you have completed the programme',
    paragraphs: [
      `Dear ${esc(name)},`,
      `${esc(hubName)} has awarded you a certificate of completion. You can view, download and print it, and share the link with employers.`,
      `Certificate number: <b>${esc(serial)}</b>. Anyone can confirm it is genuine by scanning the QR code on the certificate or visiting the link below.`,
      ...(passportUrl ? [`Looking for work? Publish your Talentral Passport and our talent team can put you forward to employers. Your certificate is already on it. Sign in with this email address at <a href="${esc(passportUrl)}">${esc(passportUrl.replace(/^https?:\/\//, ''))}</a>.`] : []),
    ],
    button: { label: 'View my certificate', url },
    footnote: 'Keep this email. Your certificate stays online and verifiable.',
  }) });
}

export function opportunityMail(to: string, name: string, role: string, employer: string, url: string): Mail {
  return { to, subject: `You have been put forward for ${role}`, ...layout({
    heading: 'An employer opportunity for you',
    paragraphs: [
      `Dear ${esc(name)},`,
      `Our talent team thinks you are a good fit for <b>${esc(role)}</b> at <b>${esc(employer)}</b>, based on your Talentral Passport.`,
      'Tell us whether you are interested: one tap, no password needed. We only share your Passport with the employer after you say yes, and you can see each time they open it.',
    ],
    button: { label: 'Answer yes or no', url },
    footnote: 'The link works for 14 days. You received this because your Passport is visible to Talentral talent officers. You can change that at any time from your Passport.',
  }) };
}

export function employerInviteMail(to: string, name: string, role: string, employer: string, url: string): Mail {
  return { to, subject: `${employer} invited you to apply: ${role}`, ...layout({
    heading: 'An employer wants to hear from you',
    paragraphs: [
      `Dear ${esc(name)},`,
      `<b>${esc(employer)}</b>, an employer verified by Talentral, found your Passport and invited you to apply for <b>${esc(role)}</b>.`,
      'Answer in one tap, no password needed. If you say yes, they see your Passport and your email and phone number so they can arrange an interview. If you say no, nothing is shared.',
    ],
    button: { label: 'Answer yes or no', url },
    footnote: 'The link works for 14 days. You received this because you let verified employers find your Passport. You can turn that off at any time from your Passport.',
  }) };
}

export function employerStatusMail(to: string, employer: string, status: 'verified' | 'rejected' | 'suspended', url: string, reason?: string | null): Mail {
  if (status === 'rejected') {
    return { to, subject: `${employer}: we need a few more details`, ...layout({
      heading: 'We could not verify your organisation yet',
      paragraphs: [
        `The Talentral talent team reviewed <b>${esc(employer)}</b> and needs more before verifying it.`,
        reason ? `<b>What to fix:</b> ${esc(reason)}` : 'Please check your organisation details.',
        'Update your details in your employer account, then press "Ask for another review". We usually reply within one working day.',
      ],
      button: { label: 'Update your details', url },
    }) };
  }
  return status === 'verified'
    ? { to, subject: `${employer} is verified on Talentral`, ...layout({
        heading: 'You can now post jobs and find talent',
        paragraphs: [
          `Good news: the Talentral talent team has verified <b>${esc(employer)}</b>.`,
          'Post your first job and you will see ranked matches from learners who have proven their skills in graded work, each with the reasons behind the match.',
        ],
        button: { label: 'Open your employer account', url },
      }) }
    : { to, subject: `${employer}: account paused`, ...layout({
        heading: 'Your employer account is paused',
        paragraphs: [`The Talentral talent team has paused <b>${esc(employer)}</b>.`, ...(reason ? [`<b>Reason:</b> ${esc(reason)}`] : []), 'Reply to this email if you think this is a mistake.'],
      }) };
}

export function employerTeamMail(to: string, name: string | null, employer: string, addedBy: string, role: 'owner' | 'member', url: string): Mail {
  return { to, subject: `You have been added to ${employer} on Talentral`, ...layout({
    heading: `Join ${esc(employer)} on Talentral`,
    paragraphs: [
      `${name ? `Dear ${esc(name)}` : 'Hello'},`,
      `${esc(addedBy)} added you to <b>${esc(employer)}</b>'s employer account on Talentral as ${role === 'owner' ? 'an owner' : 'a team member'}. You can post jobs, see matched candidates and manage hiring together.`,
      'Sign in with this email address. There is no password: we send you a secure link each time.',
    ],
    button: { label: 'Sign in to Talentral', url },
    footnote: 'If you did not expect this, you can ignore this email: nothing happens until you sign in.',
  }) };
}

export function employerReviewRequestMail(to: string, employer: string, url: string): Mail {
  return { to, subject: `Review again: ${employer}`, ...layout({
    heading: 'An employer updated their details',
    paragraphs: [`<b>${esc(employer)}</b> updated their details after your last review and asked to be checked again.`],
    button: { label: 'Review the employer', url },
  }) };
}

export function feedbackMail(to: string, name: string, hub: HubLike, lesson: string, outcome: 'graded' | 'resubmit', score: number | null, url: string, replyTo?: string | null): Mail {
  const hubName = nameOf(hub);
  return asHub(hub, { to, replyTo: replyTo ?? undefined, subject: outcome === 'graded' ? `Your work was graded: ${lesson}` : `Please try again: ${lesson}`, ...layout({
    hub,
    heading: outcome === 'graded' ? 'Your work has been graded' : 'Your hub has asked you to try again',
    paragraphs: [
      `Dear ${esc(name)},`,
      outcome === 'graded'
        ? `${esc(hubName)} has graded <b>${esc(lesson)}</b>${score !== null ? `: <b>${score}%</b>` : ''}. Read the feedback on the lesson page.`
        : `${esc(hubName)} has looked at <b>${esc(lesson)}</b> and asked you to improve it and hand it in again. The feedback tells you what to change.`,
    ],
    button: { label: outcome === 'graded' ? 'See feedback' : 'See feedback and hand in again', url },
  }) });
}

export function classReminderMail(to: string, name: string, hub: HubLike, kind: 'day' | 'soon', s: { title: string; when: string; where: string; online: boolean }, url: string, replyTo?: string | null): Mail {
  const hubName = nameOf(hub);
  return asHub(hub, { to, replyTo: replyTo ?? undefined, subject: kind === 'soon' ? `Starting soon: ${s.title}` : `Tomorrow: ${s.title}`, ...layout({
    hub,
    heading: kind === 'soon' ? 'Your class starts in about 30 minutes' : 'A reminder about your class',
    paragraphs: [
      `Dear ${esc(name)},`,
      `<b>${esc(s.title)}</b><br>${esc(s.when)} (West Africa Time)<br>${esc(s.where)}`,
      s.online ? 'Join from My learning on Talentral. Joining marks you present.' : 'At the class, scan the QR code on the screen or use the class code to check in.',
    ],
    button: { label: s.online ? 'Open My learning' : 'See my classes', url },
  }) });
}

export function announcementMail(to: string, name: string, hub: HubLike, title: string, body: string, url: string, replyTo?: string | null): Mail {
  const hubName = nameOf(hub);
  return asHub(hub, { to, replyTo: replyTo ?? undefined, subject: `${hubName}: ${title}`, ...layout({
    hub,
    heading: title,
    paragraphs: [`Dear ${esc(name)},`, esc(body).replace(/\n/g, '<br>')],
    button: { label: 'Open My learning', url },
  }) });
}

// A friendly nudge to a learner who has not been active, in the language they read Talentral in.
// The Hausa text needs a native speaker's review, like the rest of the Hausa interface.
export function nudgeMail(to: string, name: string, hub: HubLike, cohort: string, days: number, language: 'en' | 'ha', url: string, replyTo?: string | null): Mail {
  const hubName = nameOf(hub);
  const first = name.split(' ')[0] ?? name;
  if (language === 'ha') {
    return asHub(hub, { to, replyTo: replyTo ?? undefined, subject: `${first}, ci gaba da karatunka a ${hubName}`, ...layout({
      hub,
      heading: 'Muna jiran dawowarka',
      paragraphs: [
        `Sannu ${esc(first)},`,
        `Ba mu gan ka a Talentral ba tsawon kwana ${days} a cikin <b>${esc(cohort)}</b>. Kowane ɗan mataki yana da amfani: ko darasi ɗaya ne a yau, ka ci gaba daga inda ka tsaya.`,
        'Idan wani abu yana hana ka shiga, amsa wannan saƙon. Ƙungiyarmu za ta taimaka maka.',
      ],
      button: { label: 'Ci gaba da karatu', url },
    }) });
  }
  return asHub(hub, { to, replyTo: replyTo ?? undefined, subject: `${first}, pick up where you left off at ${hubName}`, ...layout({
    hub,
    heading: 'We would love to see you back',
    paragraphs: [
      `Dear ${esc(first)},`,
      `We have not seen you on Talentral for ${days} days in <b>${esc(cohort)}</b>. Every small step counts: even one lesson today keeps you on track.`,
      'If something is making it hard to take part, reply to this email and the team will help.',
    ],
    button: { label: 'Continue learning', url },
  }) });
}

// Tells the hub team which learners are still inactive after their nudge, so someone can call them.
export function teamNudgeMail(to: string, hubName: string, cohort: string, learners: { name: string; days: number; phone: string | null }[], url: string): Mail {
  const n = learners.length;
  const rows = learners.map((l) => `<b>${esc(l.name)}</b>: ${l.days} days without activity${l.phone ? ` · ${esc(l.phone)}` : ''}`).join('<br>');
  return { to, subject: `${n} ${n === 1 ? 'learner needs' : 'learners need'} a follow-up in ${cohort}`, ...layout({
    hub: hubName,
    heading: `${n} ${n === 1 ? 'learner has' : 'learners have'} not come back after a nudge`,
    paragraphs: [
      `These learners in <b>${esc(cohort)}</b> were nudged automatically and are still inactive. A phone call or a word at the hub often helps.`,
      rows,
    ],
    button: { label: 'Open the cohort', url },
    footnote: 'You receive this because you are an owner or admin of the hub. The nudge rule is set on each cohort page.',
  }) };
}

// Tells a hub's owners that Talentral support has opened their dashboard, and why.
export function supportStartedMail(to: string, hubName: string, staff: string, reason: string, until: string, url: string): Mail {
  return { to, subject: `Talentral support opened ${hubName}`, ...layout({
    hub: hubName,
    heading: 'Talentral support is in your hub',
    paragraphs: [
      `<b>${esc(staff)}</b> from the Talentral team opened your hub dashboard.`,
      `<b>Reason:</b> ${esc(reason)}<br><b>Access ends:</b> ${esc(until)} (West Africa Time)`,
      'Everything they do is in your audit log. If you did not expect this, reply to this email.',
    ],
    button: { label: 'See the audit log', url },
  }) };
}

const KEPT_AFTER_ERASURE = [
  'That a learner took part, with attendance, grades and completion, but no name or contact details, so hubs can report to funders.',
  'Your gender, year of birth, state, LGA and disability answer, if you gave them, for the same reports.',
  'A record that your certificate was withdrawn, so anyone checking it learns it is no longer valid.',
  'A record that we carried out your request, as the law requires.',
];

// The person hears that their request arrived and when it will be handled by.
export function dataRequestReceivedMail(to: string, kind: 'erasure' | 'correction', due: string, url: string): Mail {
  const erase = kind === 'erasure';
  return { to, subject: erase ? 'We received your request to delete your data' : 'We received your request to correct your data', ...layout({
    heading: erase ? 'Your deletion request' : 'Your correction request',
    paragraphs: [
      erase
        ? 'We will delete your Talentral account and the personal data linked to your email address.'
        : 'We will look at what you asked us to correct and reply when it is done.',
      `We will handle it by <b>${esc(due)}</b>. You can cancel it from your account until then.`,
      erase ? `Before we delete it, download a copy of your data if you want to keep one: your certificates will no longer be valid afterwards.` : '',
    ].filter(Boolean),
    button: { label: 'See your request', url },
    footnote: 'If you did not ask for this, sign in and cancel the request, or reply to this email.',
  }) };
}

// The platform team hears about a new request and its deadline.
export function dataRequestNoticeMail(to: string, kind: 'erasure' | 'correction', emailMasked: string, due: string, url: string): Mail {
  return { to, subject: `New data ${kind === 'erasure' ? 'deletion' : 'correction'} request, due ${due}`, ...layout({
    heading: 'A data request needs handling',
    paragraphs: [`<b>${esc(emailMasked)}</b> asked for their data to be ${kind === 'erasure' ? 'deleted' : 'corrected'}. The law gives us until <b>${esc(due)}</b>.`],
    button: { label: 'Open the privacy queue', url },
  }) };
}

// Sent after an erasure to the address the person used, with what was kept and why.
export function erasureDoneMail(to: string): Mail {
  return { to, subject: 'Your Talentral data has been deleted', ...layout({
    heading: 'Your data has been deleted',
    paragraphs: [
      'As you asked, we deleted your Talentral account, your contact details, your application answers, your uploaded files, your written work and your discussion posts.',
      `We kept only what hubs and the law need, without your name or contact details:<br>${KEPT_AFTER_ERASURE.map((k) => `• ${esc(k)}`).join('<br>')}`,
      'This is the last email you will get from Talentral about your account.',
    ],
  }) };
}

// A correction done, or a request declined, with the team's note.
export function dataRequestClosedMail(to: string, kind: 'erasure' | 'correction', status: 'completed' | 'declined', outcome: string | null): Mail {
  const what = kind === 'erasure' ? 'deletion' : 'correction';
  return { to, subject: status === 'completed' ? `Your ${what} request is done` : `About your ${what} request`, ...layout({
    heading: status === 'completed' ? `Your ${what} request is done` : `We could not carry out your ${what} request`,
    paragraphs: [outcome ? esc(outcome) : status === 'completed' ? 'We made the change you asked for.' : 'Reply to this email if you have questions.'],
  }) };
}

export const KEPT_AFTER_DELETION = KEPT_AFTER_ERASURE;

// ---------------------------------------------------------------- applications and placements (MVP-2 month 8)

// Tells an employer's team that someone applied through the jobs board.
export function newApplicantMail(to: string, employer: string, role: string, applicant: string, reasons: string[], url: string): Mail {
  return { to, subject: `New applicant for ${role}: ${applicant}`, ...layout({
    heading: 'Someone applied to your job',
    paragraphs: [
      `<b>${esc(applicant)}</b> applied for <b>${esc(role)}</b> at ${esc(employer)} with their Talentral Passport.`,
      reasons.length ? `Why they may fit: ${reasons.map(esc).join('; ')}.` : 'Open the job to see their Passport, skills and graded work.',
      'You can see their contact details and record interviews, offers and hires from the job page.',
    ],
    button: { label: 'See the applicant', url },
    footnote: 'Use applicants’ details only to recruit for this job, and never charge them a fee.',
  }) };
}

const STAGE_COPY = {
  interviewed: {
    en: { subject: 'wants to interview you', heading: 'You have an interview', body: 'They will contact you to arrange the time and place. Check your email and phone, and read the job again before you go.' },
    ha: { subject: 'na son yin hira da kai', heading: 'Kana da hira', body: 'Za su tuntuɓe ka domin shirya lokaci da wuri. Duba imel da wayarka, kuma ka sake karanta bayanin aikin kafin ka tafi.' },
  },
  offered: {
    en: { subject: 'made you an offer', heading: 'You have a job offer', body: 'Read the offer carefully. A genuine employer never asks you to pay a fee to start work. If anything seems wrong, reply to this email.' },
    ha: { subject: 'sun yi maka tayin aiki', heading: 'An yi maka tayin aiki', body: 'Karanta tayin a hankali. Mai ɗaukar aiki na gaskiya ba ya neman ka biya kuɗi kafin ka fara aiki. Idan wani abu bai yi daidai ba, amsa wannan saƙon.' },
  },
  placed: {
    en: { subject: 'hired you', heading: 'Congratulations on your new job', body: 'The employer recorded your hire on Talentral. We will check in after 90 days to see how it is going. Your hub will be proud.' },
    ha: { subject: 'sun ɗauke ka aiki', heading: 'Barka da sabon aiki', body: 'Mai ɗaukar aikin ya rubuta ɗaukarka a Talentral. Za mu tuntuɓe ka bayan kwana 90 mu ji yadda abubuwa ke tafiya.' },
  },
  declined: {
    en: { subject: 'update on your application', heading: 'Not selected this time', body: 'The employer chose another candidate for this job. Every application builds your experience. Keep your Passport up to date and look at the other jobs on Talentral.' },
    ha: { subject: 'labari game da neman aikinka', heading: 'Ba a zaɓe ka wannan karon ba', body: 'Mai ɗaukar aikin ya zaɓi wani don wannan aikin. Kowane nema yana ƙara maka gogewa. Sabunta Fasfonka kuma ka duba sauran ayyuka a Talentral.' },
  },
} as const;
export type NotifiedApplicationStage = keyof typeof STAGE_COPY;

// Tells a learner how their application moved on, in the language they read Talentral in.
export function applicationUpdateMail(to: string, name: string, role: string, employer: string, stage: NotifiedApplicationStage, language: 'en' | 'ha', url: string): Mail {
  const c = STAGE_COPY[stage][language];
  const first = name.split(' ')[0] || name;
  return { to, subject: stage === 'declined' ? `${role}: ${c.subject}` : `${employer} ${c.subject}`, ...layout({
    heading: c.heading,
    paragraphs: [
      `${language === 'ha' ? 'Sannu' : 'Dear'} ${esc(first)},`,
      `<b>${esc(role)}</b> · ${esc(employer)}`,
      c.body,
    ],
    button: { label: language === 'ha' ? 'Duba neman aikina' : 'See my applications', url },
  }) };
}

// Asks the employer to confirm a hire the talent team recorded.
export function confirmHireMail(to: string, employer: string, person: string, role: string, start: string, url: string): Mail {
  return { to, subject: `Please confirm: you hired ${person}`, ...layout({
    heading: 'Please confirm this hire',
    paragraphs: [
      `The Talentral talent team recorded that <b>${esc(employer)}</b> hired <b>${esc(person)}</b> as <b>${esc(role)}</b>, starting ${esc(start)}.`,
      'Confirming takes one click. Confirmed hires count for the hub that trained them and for the funders who support it. If anything is wrong, correct it on the job page.',
    ],
    button: { label: 'Confirm the hire', url },
  }) };
}

// The 90-day retention check: the first ask, and one reminder a week later.
export function retentionCheckMail(to: string, employer: string, people: { name: string; role: string; start: string }[], kind: 'ask' | 'remind', url: string): Mail {
  const n = people.length;
  return { to, subject: `${kind === 'remind' ? 'Reminder: ' : ''}90-day check for ${n === 1 ? people[0]!.name : `${n} people you hired`}`, ...layout({
    heading: n === 1 ? `Is ${people[0]!.name} still with you?` : 'Are the people you hired still with you?',
    paragraphs: [
      `It is 90 days since ${n === 1 ? 'this person' : 'these people'} started at <b>${esc(employer)}</b>:`,
      people.map((p) => `• <b>${esc(p.name)}</b>, ${esc(p.role)}, started ${esc(p.start)}`).join('<br>'),
      'One answer for each tells the hub that trained them whether the training led to lasting work. It takes a few seconds.',
    ],
    button: { label: 'Answer the 90-day check', url },
  }) };
}

export interface DigestFigures { selection: boolean; applications: number; scoredByYou: number; toScore: number; toGrade: number; attendance: number | null; classes: number; quiet: number; certified: number; placed: number }

// Monday's summary for a hub team member: the last 7 days in a few figures, and what is waiting.
export function weeklyDigestMail(to: string, name: string | null, hubName: string, f: DigestFigures, url: string, settingsUrl: string): Mail {
  const row = (label: string, value: string) => `<tr><td style="padding:7px 0;border-bottom:1px solid #EEF1F6;color:#5B6482">${esc(label)}</td><td style="padding:7px 0;border-bottom:1px solid #EEF1F6;text-align:right;font-weight:bold;color:#101733">${esc(value)}</td></tr>`;
  const n = (v: number) => v.toLocaleString('en-NG');
  const waiting = [
    f.toScore ? `${n(f.toScore)} ${f.toScore === 1 ? 'application' : 'applications'} for you to score` : null,
    f.toGrade ? `${n(f.toGrade)} ${f.toGrade === 1 ? 'piece' : 'pieces'} of work to grade` : null,
    f.quiet ? `${n(f.quiet)} ${f.quiet === 1 ? 'learner has' : 'learners have'} gone quiet after a reminder` : null,
  ].filter(Boolean) as string[];
  return { to, subject: `${hubName}: your week on Talentral`, ...layout({
    hub: hubName,
    heading: 'Your week at a glance',
    paragraphs: [
      `${name ? `${esc(name.split(' ')[0]!)}, here` : 'Here'} is what happened at <b>${esc(hubName)}</b> in the last 7 days.`,
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${[
        ...(f.selection ? [row('New applications', n(f.applications)), row('Applications you scored', n(f.scoredByYou))] : []), row('Classes held', n(f.classes)),
        row('Attendance', f.attendance === null ? 'No classes marked' : `${f.attendance}%`), row('Certificates issued', n(f.certified)), row('Learners placed in work', n(f.placed)),
      ].join('')}</table>`,
      waiting.length ? `<b>Waiting for your team</b><br>${waiting.map((w) => `• ${esc(w)}`).join('<br>')}` : 'Nothing is waiting for your team. A good week.',
    ],
    button: { label: 'Open the dashboard', url },
    footnote: `You get this every Monday as a member of ${esc(hubName)}. <a href="${esc(settingsUrl)}" style="color:#5B6482">Turn it off</a> from the bell in your dashboard.`,
  }) };
}

// Work Engine: shortlist requests and deliveries, placement invoices and job alerts.
export function shortlistRequestedMail(to: string, employer: string, role: string, due: string, url: string): Mail {
  return { to, subject: `Shortlist requested: ${role} at ${employer}`, ...layout({
    heading: 'A shortlist is due',
    paragraphs: [
      `<b>${esc(employer)}</b> asked for a shortlist for <b>${esc(role)}</b>.`,
      `It is due by <b>${esc(due)}</b> (three working days). Put forward the best matches; each person answers yes or no from a one-tap link, then send the shortlist from the role page.`,
    ],
    button: { label: 'Open the role', url },
  }) };
}

export function shortlistSentMail(to: string, employer: string, role: string, people: number, url: string): Mail {
  return { to, subject: `Your shortlist for ${role} is ready`, ...layout({
    heading: 'Your shortlist is ready',
    paragraphs: [
      `The Talentral talent team has sent ${employer ? `<b>${esc(employer)}</b> ` : ''}a shortlist for <b>${esc(role)}</b>: ${people} ${people === 1 ? 'person has' : 'people have'} said yes and shared their Passport with you.`,
      'Each Passport shows verified skills, graded work and certificates. Contact details are on the job page; record interviews and hires there so we can follow up.',
    ],
    button: { label: 'See the shortlist', url },
  }) };
}

export function invoiceIssuedMail(to: string, employer: string, number: string, total: string, due: string, role: string, person: string,
  url: string | null, bank: { bank: string; accountName: string; accountNumber: string } | null): Mail {
  const pay = bank ? `Pay to <b>${esc(bank.accountName)}</b>, ${esc(bank.bank)}, account <b>${esc(bank.accountNumber)}</b>, quoting <b>${esc(number)}</b>.`
    : `The Talentral team will send the bank details. Please quote <b>${esc(number)}</b> with your payment.`;
  return { to, subject: `Invoice ${number} from Talentral`, ...layout({
    heading: `Invoice ${number}`,
    paragraphs: [
      `Thank you for hiring through Talentral. This is the invoice for placing <b>${esc(person)}</b> as <b>${esc(role)}</b> at <b>${esc(employer)}</b>.`,
      `Amount: <b>${esc(total)}</b>, due by <b>${esc(due)}</b>. ${pay}`,
      'If the hire leaves within 60 days of starting, we find a replacement at no further fee. No interest or late-payment charge is ever added.',
    ],
    ...(url ? { button: { label: 'View the invoice', url } } : {}),
  }) };
}

export interface JobAlertItem { title: string; employer: string; where: string; pay: string | null; url: string; matched: string[] }

export function jobAlertMail(to: string, name: string | null, language: 'en' | 'ha', jobs: JobAlertItem[], settingsUrl: string): Mail {
  const ha = language === 'ha';
  const list = jobs.map((j) => `<b>${esc(j.title)}</b> · ${esc(j.employer)}<br><span style="color:#5B6482">${esc(j.where)}${j.pay ? ` · ${esc(j.pay)}` : ''}${j.matched.length ? `<br>${ha ? 'Ƙwarewar da kake da ita' : 'Your matching skills'}: ${esc(j.matched.join(', '))}` : ''}</span><br><a href="${esc(j.url)}" style="color:#2E5BFF">${ha ? 'Duba ka nema' : 'See and apply'}</a>`).join('<br><br>');
  return { to, subject: ha ? `Sabbin ayyuka da suka dace da kai (${jobs.length})` : `${jobs.length} new ${jobs.length === 1 ? 'job matches' : 'jobs match'} your Passport`, ...layout({
    heading: ha ? 'Sabbin ayyuka gare ka' : 'New jobs for you',
    paragraphs: [
      ha ? `${name ? `${esc(name.split(' ')[0]!)}, w` : 'W'}aɗannan ayyukan da aka buga kwanan nan sun dace da Fasfonka.` : `${name ? `${esc(name.split(' ')[0]!)}, these` : 'These'} jobs were posted recently by verified employers and match your Passport.`,
      list,
    ],
    footnote: ha ? `Kana samun wannan saboda ka kunna sanarwar ayyuka. <a href="${esc(settingsUrl)}" style="color:#5B6482">Kashe ta</a> a Fasfonka.`
      : `You get these because you turned on job alerts. <a href="${esc(settingsUrl)}" style="color:#5B6482">Turn them off</a> on your Passport.`,
  }) };
}
