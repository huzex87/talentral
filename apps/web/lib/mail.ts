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

export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const esc = escapeHtml;

// One branded layout for every message: plain, readable on phones, no remote images.
// Paragraphs are HTML: escape anything that came from users before passing it in.
export function layoutMail(opts: { heading: string; paragraphs: string[]; button?: { label: string; url: string }; footnote?: string; hub?: string }) {
  return layout(opts);
}

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

export function certificateMail(to: string, name: string, hubName: string, url: string, serial: string, replyTo?: string | null, passportUrl?: string): Mail {
  return { to, subject: `Your certificate from ${hubName}`, replyTo: replyTo ?? undefined, ...layout({
    hub: hubName,
    heading: 'Congratulations, you have completed the programme',
    paragraphs: [
      `Dear ${esc(name)},`,
      `${esc(hubName)} has awarded you a certificate of completion. You can view, download and print it, and share the link with employers.`,
      `Certificate number: <b>${esc(serial)}</b>. Anyone can confirm it is genuine by scanning the QR code on the certificate or visiting the link below.`,
      ...(passportUrl ? [`Looking for work? Publish your Talentral Passport and our talent team can put you forward to employers. Your certificate is already on it. Sign in with this email address at <a href="${esc(passportUrl)}">${esc(passportUrl.replace(/^https?:\/\//, ''))}</a>.`] : []),
    ],
    button: { label: 'View my certificate', url },
    footnote: 'Keep this email. Your certificate stays online and verifiable.',
  }) };
}

export function opportunityMail(to: string, name: string, role: string, employer: string, url: string): Mail {
  return { to, subject: `You have been put forward for ${role}`, ...layout({
    heading: 'An employer opportunity for you',
    paragraphs: [
      `Dear ${esc(name)},`,
      `Our talent team thinks you are a good fit for <b>${esc(role)}</b> at <b>${esc(employer)}</b>, based on your Talentral Passport.`,
      'Tell us whether you are interested. We only share your Passport with the employer after you say yes, and you can see each time they open it.',
    ],
    button: { label: 'See the opportunity', url },
    footnote: 'You received this because your Passport is visible to Talentral talent officers. You can change that at any time from your Passport.',
  }) };
}

export function employerInviteMail(to: string, name: string, role: string, employer: string, url: string): Mail {
  return { to, subject: `${employer} invited you to apply: ${role}`, ...layout({
    heading: 'An employer wants to hear from you',
    paragraphs: [
      `Dear ${esc(name)},`,
      `<b>${esc(employer)}</b>, an employer verified by Talentral, found your Passport and invited you to apply for <b>${esc(role)}</b>.`,
      'If you say yes, they see your Passport and your email and phone number so they can arrange an interview. If you say no, nothing is shared.',
    ],
    button: { label: 'See the invitation', url },
    footnote: 'You received this because you let verified employers find your Passport. You can turn that off at any time from your Passport.',
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

export function feedbackMail(to: string, name: string, hubName: string, lesson: string, outcome: 'graded' | 'resubmit', score: number | null, url: string, replyTo?: string | null): Mail {
  return { to, replyTo: replyTo ?? undefined, subject: outcome === 'graded' ? `Your work was graded: ${lesson}` : `Please try again: ${lesson}`, ...layout({
    hub: hubName,
    heading: outcome === 'graded' ? 'Your work has been graded' : 'Your hub has asked you to try again',
    paragraphs: [
      `Dear ${esc(name)},`,
      outcome === 'graded'
        ? `${esc(hubName)} has graded <b>${esc(lesson)}</b>${score !== null ? `: <b>${score}%</b>` : ''}. Read the feedback on the lesson page.`
        : `${esc(hubName)} has looked at <b>${esc(lesson)}</b> and asked you to improve it and hand it in again. The feedback tells you what to change.`,
    ],
    button: { label: outcome === 'graded' ? 'See feedback' : 'See feedback and hand in again', url },
  }) };
}

export function classReminderMail(to: string, name: string, hubName: string, kind: 'day' | 'soon', s: { title: string; when: string; where: string; online: boolean }, url: string, replyTo?: string | null): Mail {
  return { to, replyTo: replyTo ?? undefined, subject: kind === 'soon' ? `Starting soon: ${s.title}` : `Tomorrow: ${s.title}`, ...layout({
    hub: hubName,
    heading: kind === 'soon' ? 'Your class starts in about 30 minutes' : 'A reminder about your class',
    paragraphs: [
      `Dear ${esc(name)},`,
      `<b>${esc(s.title)}</b><br>${esc(s.when)} (West Africa Time)<br>${esc(s.where)}`,
      s.online ? 'Join from My learning on Talentral. Joining marks you present.' : 'At the class, scan the QR code on the screen or use the class code to check in.',
    ],
    button: { label: s.online ? 'Open My learning' : 'See my classes', url },
  }) };
}

export function announcementMail(to: string, name: string, hubName: string, title: string, body: string, url: string, replyTo?: string | null): Mail {
  return { to, replyTo: replyTo ?? undefined, subject: `${hubName}: ${title}`, ...layout({
    hub: hubName,
    heading: title,
    paragraphs: [`Dear ${esc(name)},`, esc(body).replace(/\n/g, '<br>')],
    button: { label: 'Open My learning', url },
  }) };
}

// A friendly nudge to a learner who has not been active, in the language they read Talentral in.
// The Hausa text needs a native speaker's review, like the rest of the Hausa interface.
export function nudgeMail(to: string, name: string, hubName: string, cohort: string, days: number, language: 'en' | 'ha', url: string, replyTo?: string | null): Mail {
  const first = name.split(' ')[0] ?? name;
  if (language === 'ha') {
    return { to, replyTo: replyTo ?? undefined, subject: `${first}, ci gaba da karatunka a ${hubName}`, ...layout({
      hub: hubName,
      heading: 'Muna jiran dawowarka',
      paragraphs: [
        `Sannu ${esc(first)},`,
        `Ba mu gan ka a Talentral ba tsawon kwana ${days} a cikin <b>${esc(cohort)}</b>. Kowane ɗan mataki yana da amfani: ko darasi ɗaya ne a yau, ka ci gaba daga inda ka tsaya.`,
        'Idan wani abu yana hana ka shiga, amsa wannan saƙon. Ƙungiyarmu za ta taimaka maka.',
      ],
      button: { label: 'Ci gaba da karatu', url },
    }) };
  }
  return { to, replyTo: replyTo ?? undefined, subject: `${first}, pick up where you left off at ${hubName}`, ...layout({
    hub: hubName,
    heading: 'We would love to see you back',
    paragraphs: [
      `Dear ${esc(first)},`,
      `We have not seen you on Talentral for ${days} days in <b>${esc(cohort)}</b>. Every small step counts: even one lesson today keeps you on track.`,
      'If something is making it hard to take part, reply to this email and the team will help.',
    ],
    button: { label: 'Continue learning', url },
  }) };
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
