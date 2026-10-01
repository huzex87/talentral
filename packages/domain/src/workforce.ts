// MVP-2 month 7: labelled skill matches for job seekers, the checks a talent officer runs before
// verifying an employer, and job board helpers. Pure, so the rules are covered by tests.
import { skillMatches } from './passport';

// ---------------------------------------------------------------- verification labels

// Every claim on a Passport carries one of three labels (master plan A8, Talentral Verify):
// self-declared, platform-evidenced (earned in graded work on Talentral) or verified (checked by a
// talent officer or trusted issuer).
export type EvidenceKind = 'verified' | 'platform' | 'self';
export type SkillStatus = EvidenceKind | 'missing';

export const EVIDENCE_LABELS: Record<EvidenceKind, string> = { verified: 'Verified', platform: 'Platform-evidenced', self: 'Self-declared' };
export const EVIDENCE_LABELS_HA: Record<EvidenceKind, string> = { verified: 'An tabbatar', platform: 'Shaidar Talentral', self: 'Da bakinsa' };

export interface SkillSources { self: string[]; evidenced: string[]; verified: string[] }

// For each skill a job asks for, the strongest evidence the person has.
export function skillStatus(required: string[], s: SkillSources): { skill: string; status: SkillStatus }[] {
  const has = (list: string[], want: string) => list.some((h) => skillMatches(want, h));
  return required.map((skill) => ({
    skill,
    status: has(s.verified, skill) ? 'verified' : has(s.evidenced, skill) ? 'platform' : has(s.self, skill) ? 'self' : 'missing',
  }));
}

export function matchSummary(statuses: { status: SkillStatus }[]) {
  const have = statuses.filter((x) => x.status !== 'missing').length;
  const proven = statuses.filter((x) => x.status === 'verified' || x.status === 'platform').length;
  return { have, proven, total: statuses.length };
}

// A portfolio item's label: verified by an officer, platform-evidenced when it is graded work on
// Talentral, otherwise self-declared.
export function portfolioKind(item: { verified_at: Date | string | null; submission_id: string | null }): EvidenceKind {
  return item.verified_at ? 'verified' : item.submission_id ? 'platform' : 'self';
}

// ---------------------------------------------------------------- employer verification

// Corporate Affairs Commission numbers: RC (companies), BN (business names), IT (incorporated
// trustees), LP and LLP (partnerships).
const CAC = /^(RC|BN|IT|LLP|LP)\s?(\d{1,8})$/i;
export function normaliseCac(raw: string): string {
  const m = raw.trim().replace(/[\s-]+/g, ' ').match(CAC);
  return m ? `${m[1]!.toUpperCase()} ${m[2]}` : raw.trim().toUpperCase();
}
export function cacNumberProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  return CAC.test(v.replace(/[\s-]+/g, ' ')) ? null : 'Enter the CAC number as shown on the certificate, for example RC 1234567 or BN 2345678.';
}

const FREE_EMAIL = new Set(['gmail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com']);
export const emailDomain = (email: string | null) => (email ?? '').split('@')[1]?.toLowerCase().trim() ?? '';
export function websiteDomain(url: string | null): string {
  try { return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, '') : ''; } catch { return ''; }
}

export interface VerificationCheck { key: string; label: string; ok: boolean | null; detail: string }

// What a talent officer looks at before verifying an employer. Signals, not proof: the officer
// still checks the CAC register or calls.
export function verificationChecks(e: { cac_number: string | null; website: string | null; contact_email: string | null; contact_phone: string | null }): VerificationCheck[] {
  const email = emailDomain(e.contact_email);
  const site = websiteDomain(e.website);
  const sameDomain = Boolean(email && site && (email === site || email.endsWith(`.${site}`) || site.endsWith(`.${email}`)));
  return [
    { key: 'cac', label: 'CAC registration number', ok: e.cac_number ? !cacNumberProblem(e.cac_number) : false,
      detail: e.cac_number ? `${e.cac_number}. Check it on the CAC public search.` : 'Not given yet.' },
    { key: 'website', label: 'Website', ok: Boolean(site), detail: site || 'Not given.' },
    { key: 'email', label: 'Work email on the same domain', ok: site ? sameDomain : null,
      detail: !email ? 'No contact email.' : FREE_EMAIL.has(email) ? `${email} is a personal email provider. Confirm by phone.` : sameDomain ? `${email} matches the website.` : site ? `${email} does not match ${site}.` : `${email}; no website to compare.` },
    { key: 'phone', label: 'Phone number', ok: Boolean(e.contact_phone?.trim()), detail: e.contact_phone?.trim() || 'Not given.' },
  ];
}

// ---------------------------------------------------------------- jobs

export type JobStatus = 'draft' | 'open' | 'filled' | 'closed';
export const JOB_STATUS_LABELS: Record<JobStatus, string> = { draft: 'Draft', open: 'Open', filled: 'Filled', closed: 'Closed' };

// "Closes today", "Closes tomorrow", "Closes in 5 days", "Closes 12 Oct"; days are WAT dates 'YYYY-MM-DD'.
export function closingLabel(closesOn: string | null, today: string): string | null {
  if (!closesOn) return null;
  const days = Math.round((Date.parse(`${closesOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return 'Closed';
  if (days === 0) return 'Closes today';
  if (days === 1) return 'Closes tomorrow';
  if (days <= 7) return `Closes in ${days} days`;
  return `Closes ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${closesOn}T00:00:00Z`))}`;
}
