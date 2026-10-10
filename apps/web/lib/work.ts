import 'server-only';
// Work Engine helpers on the server: private reply links for candidates, and telling a candidate
// about a role by email and by text (WhatsApp if they chose it, SMS otherwise).
import { system, type Tx } from '@talentral/db';
import { env } from './env';
import { newToken } from './tokens';
import { employerInviteMail, opportunityMail, sendMail } from './mail';
import { optedInNumbers, sendTexts, textingEnabled } from './texts';

export const REPLY_LINK_DAYS = 14;

// Issues (or replaces) the candidate's reply link inside the caller's transaction. The database
// checks that the caller is a talent officer or a member of the verified employer. Only the hash is
// stored, so the link exists only in the messages it is sent in.
export async function issueReplyLink(tx: Tx, candidateId: string): Promise<string> {
  const { token, hash } = newToken();
  await tx`select app.issue_reply_link(${candidateId}, ${hash}, ${REPLY_LINK_DAYS})`;
  return `${env.appUrl}/r/${token}`;
}

interface Contact { email: string; full_name: string | null; phone: string | null; language: 'en' | 'ha' }

// The person's own number if they signed in by phone, otherwise the one on their latest application.
// Read with the system connection: employers never see these details until the person says yes.
async function contactOf(userId: string): Promise<Contact | null> {
  const [c] = await system()<Contact[]>`
    select u.email::text, u.full_name, coalesce(u.language, 'en') as language,
      coalesce(u.phone, (select a.phone from public.applications a where a.email = u.email order by a.submitted_at desc nulls last limit 1)) as phone
    from public.users u where u.id = ${userId}`;
  return c ?? null;
}

export function roleText(language: 'en' | 'ha', employer: string, role: string, url: string, invited: boolean): string {
  if (language === 'ha') {
    return invited
      ? `Talentral: ${employer} sun ga Fasfonka kuma suna gayyatarka zuwa aikin "${role}". Kana so? Amsa da taɓawa ɗaya: ${url}`
      : `Talentral: ${employer} na la'akari da kai don aikin "${role}". Kana so? Amsa da taɓawa ɗaya: ${url}`;
  }
  return invited
    ? `Talentral: ${employer} found your Passport and invited you to apply for "${role}". Interested? Answer in one tap: ${url}`
    : `Talentral: you have been put forward for "${role}" at ${employer}. Interested? Answer in one tap: ${url}`;
}

// Emails the person and texts them the same one-tap link. Never throws: a failed message is logged.
export async function notifyCandidate(userId: string, opts: { role: string; employer: string; url: string; invited: boolean }): Promise<void> {
  const c = await contactOf(userId).catch((e) => { console.error('candidate contact lookup failed', e); return null; });
  if (!c) return;
  const name = c.full_name ?? 'there';
  const mail = opts.invited ? employerInviteMail(c.email, name, opts.role, opts.employer, opts.url) : opportunityMail(c.email, name, opts.role, opts.employer, opts.url);
  await sendMail(mail).catch((e) => console.error('candidate email failed', e));
  if (c.phone && textingEnabled()) {
    const optedIn = await optedInNumbers([c.phone]);
    await sendTexts([{ phone: c.phone, language: c.language, hub: 'Talentral', text: roleText(c.language, opts.employer, opts.role, opts.url, opts.invited) }], optedIn)
      .catch((e) => console.error('candidate text failed', e));
  }
}
