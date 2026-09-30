// Automated nudges for inactive learners (E12.2). A cohort's rule says after how many days without
// learning activity a learner gets a friendly nudge, and how many days after that the hub team is
// told so someone can follow up in person. Pure, so the timing is covered by tests.
import { inQuietHours } from './live';

export interface NudgeRule { afterDays: number; escalateDays: number }
export type NudgeStep = 'learner' | 'team';

export const NUDGE_DEFAULTS: NudgeRule = { afterDays: 5, escalateDays: 3 };
export const NUDGE_LIMITS = { afterDays: [2, 30], escalateDays: [1, 14] } as const;

const DAY = 24 * 60 * 60 * 1000;

export function validateRule(r: NudgeRule): string | null {
  const [a1, a2] = NUDGE_LIMITS.afterDays;
  const [e1, e2] = NUDGE_LIMITS.escalateDays;
  if (!Number.isInteger(r.afterDays) || r.afterDays < a1 || r.afterDays > a2) return `Choose ${a1} to ${a2} days before the first nudge.`;
  if (!Number.isInteger(r.escalateDays) || r.escalateDays < e1 || r.escalateDays > e2) return `Choose ${e1} to ${e2} days before the team is told.`;
  return null;
}

// Whole days since the learner was last active (or since the cohort started, if never).
export function daysInactive(since: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY));
}

export interface NudgeState {
  since: Date; // start of the current quiet spell
  learnerNudgedAt: Date | null; // the learner nudge for this spell, if sent
  teamAlerted: boolean; // the team alert for this spell, if sent
}

// Which step, if any, is due now. Nothing goes out in quiet hours (21:00 to 07:00 WAT). The team is
// told only after the learner has had their nudge and escalateDays have passed without activity.
export function nudgeDue(rule: NudgeRule, s: NudgeState, now: Date): NudgeStep | null {
  if (inQuietHours(now)) return null;
  if (!s.learnerNudgedAt) return now.getTime() - s.since.getTime() >= rule.afterDays * DAY ? 'learner' : null;
  if (s.teamAlerted) return null;
  return now.getTime() - s.learnerNudgedAt.getTime() >= rule.escalateDays * DAY ? 'team' : null;
}

export type Engagement = 'active' | 'quiet' | 'inactive' | 'never';
export const ENGAGEMENT_LABELS: Record<Engagement, string> = { active: 'Active', quiet: 'Quiet', inactive: 'Inactive', never: 'Not started' };

// How the hub sees each learner: active in the last 2 days, quiet, or inactive by the cohort's rule
// (the default rule when nudges are off). "Not started" is someone with no activity at all yet, until
// the rule's days have passed, when they count as inactive like anyone else.
export function engagement(lastActive: Date | null, since: Date, now: Date, afterDays: number = NUDGE_DEFAULTS.afterDays): Engagement {
  const days = daysInactive(since, now);
  if (!lastActive) return days >= afterDays ? 'inactive' : 'never';
  if (days < 2) return 'active';
  return days >= afterDays ? 'inactive' : 'quiet';
}

// The learner's nudge, in the language they read Talentral in. Short enough for one SMS page each.
export function nudgeSms(language: 'en' | 'ha', hub: string, firstName: string, days: number): string {
  return language === 'ha'
    ? `${hub}: Sannu ${firstName}, ba mu gan ka a Talentral ba tsawon kwana ${days}. Ci gaba daga inda ka tsaya: talentral.ng/learn. Idan kana buƙatar taimako, tuntuɓe mu.`
    : `${hub}: Hi ${firstName}, we have not seen you on Talentral for ${days} days. Pick up where you left off: talentral.ng/learn. If you need help, get in touch.`;
}
