// Proving skills: weighted assessment scores, the completion rule that combines attendance with
// assessment, and certificate serial numbers.
import { newReference } from './reference';
import type { Standing } from './cohort';

export const ASSESSMENT_KINDS = { assignment: 'Assignment', quiz: 'Quiz', project: 'Project', practical: 'Practical' } as const;
export type AssessmentKind = keyof typeof ASSESSMENT_KINDS;

export interface AssessmentDef { id: string; max: number; weight: number }

// Weighted percentage over the assessments that have been graded for this learner. Ungraded work is
// reported separately (graded / total) rather than counted as zero, so a gradebook in progress does
// not make learners look as if they failed.
export function weightedScore(assessments: AssessmentDef[], results: Record<string, number | undefined>): { percent: number | null; graded: number; total: number } {
  let got = 0;
  let possible = 0;
  let graded = 0;
  for (const a of assessments) {
    const s = results[a.id];
    if (s === undefined || s === null || Number.isNaN(s)) continue;
    graded += 1;
    got += (Math.min(Math.max(s, 0), a.max) / a.max) * a.weight;
    possible += a.weight;
  }
  return { percent: possible ? Math.round((got / possible) * 1000) / 10 : null, graded, total: assessments.length };
}

// The completion rule: the attendance bar always applies; the pass mark applies once a cohort has
// assessments. A learner "meets" the rule only when every part that applies is met and all
// assessments are graded; "at risk" when within 10 points of a bar.
export function completionStanding(
  attendance: number | null, minAttendance: number,
  score: { percent: number | null; graded: number; total: number }, passMark: number,
): Standing {
  if (attendance === null && score.total === 0) return 'no_sessions';
  const bars: [number | null, number][] = [[attendance, minAttendance]];
  if (score.total > 0) bars.push([score.graded === score.total ? score.percent : null, passMark]);
  if (bars.every(([v, min]) => v !== null && v >= min)) return 'meets';
  if (bars.some(([v, min]) => v !== null && v < min - 10)) return 'below';
  return 'at_risk';
}

export const CERTIFICATE_PATTERN = /^TAL-[A-Z]{3}-\d{2}-[0-9A-HJKMNP-TV-Z]{6}$/;

// Serial numbers such as TAL-KIR-26-7K4Q2M: hub prefix, year of completion and six Crockford
// characters (no I, L, O or U), easy to read aloud or type from a printed certificate.
export function certificateSerial(hubPrefix: string, completed: Date, random?: (n: number) => Uint8Array): string {
  const [prefix, year, five] = newReference(hubPrefix, completed, random).split('-');
  const extra = newReference(hubPrefix, completed, random).split('-')[2]!.slice(0, 1);
  return `TAL-${prefix}-${year}-${five}${extra}`;
}

// Organisations behind a programme, shown on its public page and on its certificates.
export const PARTNER_ROLES = { funder: 'Funder', sponsor: 'Sponsor', partner: 'Partner', implementing_partner: 'Implementing partner' } as const;
export type PartnerRole = keyof typeof PARTNER_ROLES;
export const MAX_PARTNERS = 6;
export interface PartnerSnapshot { name: string; role: PartnerRole; logo_path: string }
