// The Talentral Passport: labels, published readiness rules and explainable matching.
// Readiness is a status, not a score, and every match shows its reasons. Matching recommends;
// people decide.

export const AVAILABILITY = {
  immediately: 'Available now',
  one_month: 'Available within a month',
  three_months: 'Available within three months',
  not_looking: 'Not looking right now',
} as const;
export type WorkAvailability = keyof typeof AVAILABILITY;

export const WORK_MODES = { remote: 'Remote', hybrid: 'Hybrid', on_site: 'On site' } as const;
export type WorkMode = keyof typeof WORK_MODES;

export const JOB_TYPES = { full_time: 'Full time', part_time: 'Part time', contract: 'Contract', internship: 'Internship', freelance: 'Freelance' } as const;
export type JobType = keyof typeof JOB_TYPES;

export const LANGUAGES = ['English', 'Hausa', 'Yoruba', 'Igbo', 'Fulfulde', 'Kanuri', 'Pidgin', 'Arabic', 'French'] as const;

export const EMPLOYER_STAGES = { lead: 'Lead', engaged: 'Engaged', active: 'Active', dormant: 'Dormant' } as const;
export type EmployerStage = keyof typeof EMPLOYER_STAGES;

export const CANDIDATE_STAGES = { shortlisted: 'Shortlisted', interviewed: 'Interviewed', offered: 'Offered', placed: 'Placed', declined: 'Declined' } as const;
export type CandidateStage = keyof typeof CANDIDATE_STAGES;

export const INTEREST = { pending: 'Awaiting reply', confirmed: 'Interested', declined: 'Not interested' } as const;
export type Interest = keyof typeof INTEREST;

export const SHORTLIST_DAYS = 14;

// ---------------------------------------------------------------- readiness

export const READINESS = {
  not_assessed: 'Not yet assessed',
  developing: 'Developing',
  ready: 'Ready',
  ready_verified: 'Ready and Verified',
} as const;
export type Readiness = keyof typeof READINESS;

// Published to learners and employers exactly as written here.
export const READINESS_RULES: Record<Readiness, string> = {
  not_assessed: 'No programme on Talentral yet.',
  developing: 'Enrolled in a programme on Talentral and building evidence through attendance and graded work.',
  ready: 'Holds at least one Talentral certificate, earned by meeting the attendance bar and the pass mark on graded work.',
  ready_verified: 'Ready, and a Talentral talent officer has checked their identity and reviewed their evidence.',
};

export interface LearningEvidence { enrolments: number; certificates: number; verified: boolean }

export function readinessLevel({ enrolments, certificates, verified }: LearningEvidence): Readiness {
  if (certificates > 0) return verified ? 'ready_verified' : 'ready';
  return enrolments > 0 ? 'developing' : 'not_assessed';
}

// ---------------------------------------------------------------- completeness

export interface PassportBasics { headline: string | null; state: string | null; skills: string[]; work_modes: string[] }

// What a learner still needs before talent officers can find them.
export function passportGaps(p: PassportBasics, language: 'en' | 'ha' = 'en'): string[] {
  const t = (en: string, ha: string) => (language === 'ha' ? ha : en);
  const gaps: string[] = [];
  if (!p.headline?.trim()) gaps.push(t('Add a headline, such as “Junior web developer”.', 'Rubuta taken aikinka, kamar “Mai gina shafukan yanar gizo”.'));
  if (!p.state) gaps.push(t('Add the state you live in.', 'Zaɓi jihar da kake zaune.'));
  if (p.skills.length < 3) gaps.push(t(`Add at least 3 skills (you have ${p.skills.length}).`, `Ƙara aƙalla ƙwarewa 3 (kana da ${p.skills.length}).`));
  if (p.work_modes.length === 0) gaps.push(t('Choose how you want to work: remote, hybrid or on site.', 'Zaɓi yadda kake so ka yi aiki: daga nesa, gauraye ko a wurin aiki.'));
  return gaps;
}

// Tidies free-text skills: trims, collapses spaces, removes case-insensitive duplicates.
export function cleanSkills(input: string[], max = 30): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const s = raw.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

// ---------------------------------------------------------------- matching

export interface RoleRequirements { skills: string[]; work_mode: WorkMode; state: string | null }
export interface TalentProfile {
  skills: string[]; tracks: string[]; state: string | null; work_modes: string[]; availability: WorkAvailability; readiness: Readiness;
  evidenced?: string[]; // skills shown in graded work at or above the pass mark
  verified?: string[]; // skills on portfolio items a talent officer has verified
  relocate?: boolean;
}
export interface Match { score: number; matched: string[]; reasons: string[]; concerns: string[] }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim();

// Loose skill equality: "Social media marketing" satisfies "social media", and the reverse.
export function skillMatches(want: string, have: string): boolean {
  const a = norm(want); const b = norm(have);
  return a === b || (a.length >= 3 && b.includes(a)) || (b.length >= 3 && a.includes(b));
}

// Explains how well a person fits a role. The score only orders suggestions; the reasons are the
// point, and a talent officer always decides.
export function matchTalent(role: RoleRequirements, t: TalentProfile): Match {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const proven = [...(t.evidenced ?? []), ...(t.verified ?? [])];
  const evidence = [...t.skills, ...t.tracks, ...proven];
  const matched = role.skills.filter((want) => evidence.some((have) => skillMatches(want, have)));
  const shown = matched.filter((want) => proven.some((have) => skillMatches(want, have)));
  let score = 0;
  if (role.skills.length) {
    // Listing a skill counts; showing it in graded work counts more.
    score += (matched.length / role.skills.length) * 50 + (shown.length / role.skills.length) * 10;
    if (matched.length) reasons.push(`Has ${matched.length} of ${role.skills.length} required skills: ${matched.join(', ')}`);
    else concerns.push('None of the required skills listed');
    if (shown.length) reasons.push(`Shown in graded work: ${shown.join(', ')}`);
  } else score += 30;

  if (t.readiness === 'ready_verified') { score += 20; reasons.push('Ready and Verified'); }
  else if (t.readiness === 'ready') { score += 15; reasons.push('Holds a Talentral certificate'); }
  else if (t.readiness === 'developing') { score += 5; concerns.push('Still in training'); }

  if (t.work_modes.includes(role.work_mode)) { score += 10; reasons.push(`Open to ${WORK_MODES[role.work_mode].toLowerCase()} work`); }
  else concerns.push(`Has not chosen ${WORK_MODES[role.work_mode].toLowerCase()} work`);

  if (role.work_mode !== 'remote' && role.state) {
    if (t.state === role.state) { score += 5; reasons.push(`Lives in ${role.state}`); }
    else if (t.relocate) { score += 3; reasons.push(`Willing to relocate to ${role.state}`); }
    else concerns.push(`Lives outside ${role.state}`);
  } else score += 5;

  if (t.availability === 'immediately') { score += 5; reasons.push('Available now'); }
  else if (t.availability === 'not_looking') concerns.push('Not looking right now');

  return { score: Math.round(score), matched, reasons, concerns };
}

// "₦150,000 to ₦250,000 a month" and friends.
export function payRange(min: number | null, max: number | null): string | null {
  const f = (n: number) => `₦${n.toLocaleString('en-NG')}`;
  if (min && max) return min === max ? `${f(min)} a month` : `${f(min)} to ${f(max)} a month`;
  if (min) return `From ${f(min)} a month`;
  if (max) return `Up to ${f(max)} a month`;
  return null;
}
