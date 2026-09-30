// Pilot health (Gate G2): whether learners start, keep coming and attend, whether learners and
// staff would recommend Talentral (NPS), and whether any hub's data reached another. Pure, so the
// arithmetic and the survey timing are covered by tests. Dates are WAT calendar days, 'YYYY-MM-DD'.

// The G2 pass criteria from the master plan (B8), in percent (NPS in points).
export const G2 = { activation: 70, weeklyActive: 60, attendance: 70, nps: 30, crossTenantIncidents: 0 } as const;

// Ask two weeks after someone starts, then at most every 90 days; "Not now" waits 14 days.
export const NPS_TIMING = { firstAfterDays: 14, everyDays: 90, snoozeDays: 14 } as const;

const DAY = 86_400_000;
const WAT_OFFSET_MS = 3_600_000;

export function watToday(now: Date): string {
  return new Date(now.getTime() + WAT_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- NPS

export type NpsAudience = 'learner' | 'staff';
export type NpsCategory = 'promoter' | 'passive' | 'detractor';

export function npsCategory(score: number): NpsCategory {
  return score >= 9 ? 'promoter' : score >= 7 ? 'passive' : 'detractor';
}

export interface NpsResult { score: number | null; responses: number; promoters: number; passives: number; detractors: number }

// Net Promoter Score: percent promoters (9 to 10) minus percent detractors (0 to 6), from -100 to 100.
export function npsScore(scores: readonly number[]): NpsResult {
  const valid = scores.filter((s) => Number.isInteger(s) && s >= 0 && s <= 10);
  const count = (c: NpsCategory) => valid.filter((s) => npsCategory(s) === c).length;
  const promoters = count('promoter');
  const passives = count('passive');
  const detractors = count('detractor');
  const responses = valid.length;
  return { score: responses ? Math.round(((promoters - detractors) / responses) * 100) : null, responses, promoters, passives, detractors };
}

export interface NpsSurvey {
  tenantId: string;
  hubName: string;
  cohortId: string | null;
  audience: NpsAudience;
  startedAt: Date;
  lastAnswered: Date | null;
  lastDismissed: Date | null;
}

// Whether to ask this survey now.
export function npsDue(s: NpsSurvey, now: Date): boolean {
  const since = (d: Date) => now.getTime() - d.getTime();
  if (since(s.startedAt) < NPS_TIMING.firstAfterDays * DAY) return false;
  if (s.lastAnswered && since(s.lastAnswered) < NPS_TIMING.everyDays * DAY) return false;
  if (s.lastDismissed && since(s.lastDismissed) < NPS_TIMING.snoozeDays * DAY) return false;
  return true;
}

// The one survey to show on a screen: due, for the given audience (and hub, for staff screens),
// the most recently started first, so a learner is asked about the cohort they are in now.
export function pickSurvey(surveys: readonly NpsSurvey[], audience: NpsAudience, now: Date, tenantId?: string): NpsSurvey | null {
  return [...surveys]
    .filter((s) => s.audience === audience && (!tenantId || s.tenantId === tenantId) && npsDue(s, now))
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0] ?? null;
}

// ---------------------------------------------------------------- activation and weekly use

export interface HealthEnrolment {
  id: string;
  cohortId: string;
  status: 'active' | 'completed' | 'dropped';
  start: string; // the later of enrolment and cohort start
  cohortEnds: string | null;
}
export interface ActivityDay { enrolmentId: string; day: string }

function daysBy(days: readonly ActivityDay[]): Map<string, string[]> {
  const by = new Map<string, string[]>();
  for (const d of days) by.set(d.enrolmentId, [...(by.get(d.enrolmentId) ?? []), d.day]);
  return by;
}

export interface Rate { rate: number | null; count: number; of: number }

function rate(count: number, of: number): Rate {
  return { rate: of ? Math.round((count / of) * 100) : null, count, of };
}

// Learners who did something on Talentral within 7 days of starting, among those who started at
// least 7 days ago. Everyone counts, including people who later dropped out.
export function activation(enrolments: readonly HealthEnrolment[], days: readonly ActivityDay[], today: string): Rate {
  const by = daysBy(days);
  const eligible = enrolments.filter((e) => addDays(e.start, 7) <= today);
  return rate(eligible.filter((e) => (by.get(e.id) ?? []).some((d) => d <= addDays(e.start, 7))).length, eligible.length);
}

export interface WeekActive extends Rate { weekStart: string; weekEnd: string }

// Share of learners active in each of the last `weeks` 7-day windows (oldest first; the last one
// ends today). A learner counts in a week when they had started, had not dropped out, and their
// cohort had not ended before the week began.
export function weeklyActive(enrolments: readonly HealthEnrolment[], days: readonly ActivityDay[], today: string, weeks = 8): WeekActive[] {
  const by = daysBy(days);
  const out: WeekActive[] = [];
  for (let w = weeks - 1; w >= 0; w -= 1) {
    const weekEnd = addDays(today, -7 * w);
    const weekStart = addDays(weekEnd, -6);
    const population = enrolments.filter((e) => e.status !== 'dropped' && e.start <= weekEnd && (!e.cohortEnds || e.cohortEnds >= weekStart));
    const active = population.filter((e) => (by.get(e.id) ?? []).some((d) => d >= weekStart && d <= weekEnd)).length;
    out.push({ weekStart, weekEnd, ...rate(active, population.length) });
  }
  return out;
}

// Present or late among marked attendance (excused not counted).
export function attendanceShare(marks: { present: number; late: number; absent: number }): Rate {
  return rate(marks.present + marks.late, marks.present + marks.late + marks.absent);
}

// ---------------------------------------------------------------- the gate

export type GateStatus = 'met' | 'near' | 'below' | 'none';
export const GATE_LABELS: Record<GateStatus, string> = { met: 'On target', near: 'Close', below: 'Below target', none: 'No data yet' };

// Met at or above the target; close within 10 points; for incidents, any is below target.
export function gateStatus(value: number | null, target: number, lowerIsBetter = false): GateStatus {
  if (value === null) return 'none';
  if (lowerIsBetter) return value <= target ? 'met' : 'below';
  if (value >= target) return 'met';
  return target - value <= 10 ? 'near' : 'below';
}
