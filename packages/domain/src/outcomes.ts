// MVP-2 month 8: applications to jobs, employer-confirmed placements, the 90-day retention check
// and Gate G3 (pilot outcomes). Pure, so the rules behind each label and figure are tested.
// Dates are WAT calendar days, 'YYYY-MM-DD'.
import { addDays, gateStatus, type GateStatus, type Rate } from './health';
import type { CandidateStage, Interest } from './passport';

// The G3 pass criteria from the master plan (B8): completion and readiness in percent, employers
// engaged and placements as counts.
export const G3 = { completion: 60, readinessAssessed: 80, employersEngaged: 10, placements: 1 } as const;

export const RETENTION_DAYS = 90;
// The scheduler asks the employer when the check opens and reminds them a week later; after two
// weeks without an answer, talent officers follow up and may record it themselves.
export const RETENTION_REMINDER_DAYS = 7;
export const RETENTION_OFFICER_DAYS = 14;
export const MAX_APPLICATIONS_PER_DAY = 10;
export const COVER_NOTE_MAX = 1500;

// ---------------------------------------------------------------- applications

export type ApplicationSource = 'officer' | 'employer' | 'applied';

// How the employer sees where a candidate came from.
export const SOURCE_LABELS: Record<ApplicationSource, string> = {
  applied: 'Applied',
  employer: 'Invited by you',
  officer: 'Put forward by Talentral',
};

// How the learner sees it.
export const SOURCE_LABELS_LEARNER: Record<ApplicationSource, string> = {
  applied: 'You applied',
  employer: 'The employer invited you',
  officer: 'Talentral put you forward',
};
export const SOURCE_LABELS_LEARNER_HA: Record<ApplicationSource, string> = {
  applied: 'Ka nema',
  employer: 'Mai ɗaukar aikin ya gayyace ka',
  officer: 'Talentral ta gabatar da kai',
};

export const APPLICATION_STEPS = [
  { key: 'applied', en: 'Applied', ha: 'An nema' },
  { key: 'reviewing', en: 'Being reviewed', ha: 'Ana dubawa' },
  { key: 'interview', en: 'Interview', ha: 'Hira' },
  { key: 'offer', en: 'Offer', ha: 'Tayin aiki' },
  { key: 'hired', en: 'Hired', ha: 'An ɗauka' },
] as const;

export type ApplicationState = 'invited' | 'active' | 'hired' | 'not_selected' | 'withdrawn' | 'said_no' | 'closed';

export interface ApplicationProgress {
  state: ApplicationState;
  step: number; // index into APPLICATION_STEPS reached so far; -1 before the learner says yes
  en: string;
  ha: string;
  tone: 'blue' | 'teal' | 'amber' | 'neutral' | 'violet';
}

export interface ApplicationLike {
  interest: Interest;
  stage: CandidateStage;
  withdrawn_at: Date | string | null;
  role_status: string;
}

const STAGE_STEP: Record<CandidateStage, number> = { shortlisted: 1, interviewed: 2, offered: 3, placed: 4, declined: 1 };

// Where one application stands, in the learner's words.
export function applicationProgress(a: ApplicationLike): ApplicationProgress {
  if (a.withdrawn_at) return { state: 'withdrawn', step: 0, en: 'You withdrew', ha: 'Ka janye', tone: 'neutral' };
  if (a.interest === 'pending') return { state: 'invited', step: -1, en: 'Waiting for your reply', ha: 'Ana jiran amsarka', tone: 'blue' };
  if (a.interest === 'declined') return { state: 'said_no', step: -1, en: 'You said no', ha: 'Ka ƙi', tone: 'neutral' };
  if (a.stage === 'placed') return { state: 'hired', step: 4, en: 'Hired', ha: 'An ɗauke ka', tone: 'teal' };
  if (a.stage === 'declined') return { state: 'not_selected', step: 1, en: 'Not selected this time', ha: 'Ba a zaɓe ka wannan karon ba', tone: 'neutral' };
  if (a.role_status === 'filled' || a.role_status === 'closed') {
    return { state: 'closed', step: STAGE_STEP[a.stage], en: 'The job has closed', ha: 'An rufe aikin', tone: 'neutral' };
  }
  const step = STAGE_STEP[a.stage];
  const words = {
    1: { en: 'Being reviewed', ha: 'Ana dubawa' },
    2: { en: 'Interviewing', ha: 'Ana hira' },
    3: { en: 'Offer made', ha: 'An yi maka tayi' },
  }[step as 1 | 2 | 3];
  return { state: 'active', step, ...words, tone: step >= 3 ? 'violet' : 'amber' };
}

// A learner can withdraw while they are still in the running.
export function canWithdraw(a: ApplicationLike): boolean {
  return !a.withdrawn_at && a.interest === 'confirmed' && a.stage !== 'placed' && a.stage !== 'declined';
}

// Applicants in order: best match first (the reasons say why), then whoever applied first.
export function rankApplicants<T extends { match_score: number | null; applied_at: Date | string | null; created_at: Date | string }>(list: readonly T[]): T[] {
  const at = (x: T) => new Date(x.applied_at ?? x.created_at).getTime();
  return [...list].sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1) || at(a) - at(b));
}

// ---------------------------------------------------------------- placements and retention

export type PlacementConfirmation = 'awaiting' | 'employer' | 'officer';
export const CONFIRMATION_LABELS: Record<PlacementConfirmation, string> = {
  awaiting: 'Waiting for the employer to confirm',
  employer: 'Confirmed by the employer',
  officer: 'Confirmed by Talentral with the employer',
};

export function confirmationOf(p: { placement_confirmed_at: Date | string | null; placement_confirmation: 'employer' | 'officer' | null }): PlacementConfirmation {
  return p.placement_confirmed_at ? p.placement_confirmation ?? 'employer' : 'awaiting';
}

export type RetentionState = 'not_due' | 'due' | 'overdue' | 'retained' | 'left';
export const RETENTION_LABELS: Record<RetentionState, string> = {
  not_due: 'Not due yet',
  due: '90-day check due',
  overdue: '90-day check overdue',
  retained: 'Still in the job at 90 days',
  left: 'Left before 90 days',
};

export const retentionDueOn = (start: string) => addDays(start, RETENTION_DAYS);

// Where a hire's 90-day check stands today.
export function retentionState(p: { start_date: string | null; retained: boolean | null }, today: string): RetentionState {
  if (p.retained === true) return 'retained';
  if (p.retained === false) return 'left';
  if (!p.start_date) return 'not_due';
  const due = retentionDueOn(p.start_date);
  if (today < due) return 'not_due';
  return today >= addDays(due, RETENTION_OFFICER_DAYS) ? 'overdue' : 'due';
}

// Which message, if any, the scheduler sends about a hire today: the first ask when the check
// opens, then one reminder a week later. Never twice.
export function retentionMessageDue(p: { start_date: string | null; retained: boolean | null; asked: boolean; reminded: boolean }, today: string): 'ask' | 'remind' | null {
  if (p.retained !== null || !p.start_date) return null;
  const due = retentionDueOn(p.start_date);
  if (today < due) return null;
  if (!p.asked) return 'ask';
  if (!p.reminded && today >= addDays(due, RETENTION_REMINDER_DAYS)) return 'remind';
  return null;
}

// ---------------------------------------------------------------- Gate G3

export interface G3Enrolment {
  status: 'active' | 'completed' | 'dropped';
  cohortEnded: boolean;
  assessed: boolean;
  placed: boolean;
  confirmed: boolean;
  retained: boolean | null;
  retentionDue: boolean;
}

export interface G3Result {
  completion: Rate; // completed, among learners whose cohort has ended (or who already completed)
  assessed: Rate; // readiness assessed, among completers
  placements: number; // learners with a recorded hire
  confirmed: number; // of whom the employer confirmed the hire
  retention: Rate; // still in the job at 90 days, among answered checks
  retentionDue: number; // checks open and not answered yet
}

const rate = (count: number, of: number): Rate => ({ rate: of ? Math.round((count / of) * 100) : null, count, of });

export function g3Summary(rows: readonly G3Enrolment[]): G3Result {
  const eligible = rows.filter((r) => r.cohortEnded || r.status === 'completed');
  const completers = rows.filter((r) => r.status === 'completed');
  const answered = rows.filter((r) => r.retained !== null);
  return {
    completion: rate(completers.filter((r) => eligible.includes(r)).length, eligible.length),
    assessed: rate(completers.filter((r) => r.assessed).length, completers.length),
    placements: rows.filter((r) => r.placed).length,
    confirmed: rows.filter((r) => r.confirmed).length,
    retention: rate(answered.filter((r) => r.retained).length, answered.length),
    retentionDue: rows.filter((r) => r.retentionDue).length,
  };
}

// A count against a target: met at or above it, close from 70% of it.
export function countStatus(value: number, target: number): GateStatus {
  if (value >= target) return 'met';
  return value >= Math.ceil(target * 0.7) ? 'near' : 'below';
}

// An employer is engaged once they have posted a job, received a shortlist or had a candidate put
// forward or applying.
export function employerEngaged(e: { jobsPublished: number; shortlists: number; candidates: number }): boolean {
  return e.jobsPublished > 0 || e.shortlists > 0 || e.candidates > 0;
}

export interface G3Criterion { key: 'completion' | 'assessed' | 'employers' | 'placements'; label: string; status: GateStatus }

// The four G3 criteria; the employer criterion only applies to the platform as a whole.
export function g3Criteria(r: G3Result, employersEngaged: number | null): G3Criterion[] {
  return [
    { key: 'completion', label: 'Completion', status: gateStatus(r.completion.rate, G3.completion) },
    { key: 'assessed', label: 'Readiness assessed', status: gateStatus(r.assessed.rate, G3.readinessAssessed) },
    ...(employersEngaged === null ? [] : [{ key: 'employers' as const, label: 'Employers engaged', status: countStatus(employersEngaged, G3.employersEngaged) }]),
    { key: 'placements', label: 'First placements', status: r.placements >= G3.placements ? 'met' as const : 'below' as const },
  ];
}
