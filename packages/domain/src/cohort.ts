// Running a cohort: session check-in codes, attendance rates, who has met the completion bar, and
// the cohort-completion milestone report.
import { AGE_BANDS, ageBand, ageOn } from './report';

// Six characters without look-alikes (no 0/O, 1/I), easy to read off a projector or a WhatsApp message.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CHECKIN_CODE = /^[A-HJ-NP-Z2-9]{6}$/;

export function newCheckinCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  // 256 is a multiple of 32, so taking the low five bits keeps every character equally likely.
  return [...random(6)].map((b) => CODE_ALPHABET[b % 32]).join('');
}

export type Mark = 'present' | 'late' | 'absent' | 'excused';
export const MARKS: Mark[] = ['present', 'late', 'absent', 'excused'];
export const MARK_LABELS: Record<Mark, string> = { present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused' };

// Share of held sessions attended (present or late). Excused sessions are left out, and a session
// with no mark counts as absent, so gaps in the register never flatter the rate.
export function attendanceRate(marks: (Mark | null | undefined)[], sessionsHeld: number): number | null {
  const excused = marks.filter((m) => m === 'excused').length;
  const counted = sessionsHeld - excused;
  if (counted <= 0) return null;
  const attended = marks.filter((m) => m === 'present' || m === 'late').length;
  return Math.round((attended / counted) * 1000) / 10;
}

export type Standing = 'meets' | 'at_risk' | 'below' | 'no_sessions';
export const STANDING_LABELS: Record<Standing, string> = { meets: 'Meets the bar', at_risk: 'At risk', below: 'Below the bar', no_sessions: 'No sessions yet' };

// Where a learner stands against the cohort's minimum attendance; within 10 points below is "at risk".
export function standing(rate: number | null, min: number): Standing {
  if (rate === null) return 'no_sessions';
  if (rate >= min) return 'meets';
  return rate >= min - 10 ? 'at_risk' : 'below';
}

// ---------------------------------------------------------------- cohort completion report

export interface CohortLearner {
  status: 'active' | 'completed' | 'dropped';
  rate: number | null;
  track: string | null;
  source: 'applied' | 'imported';
  answers: Record<string, unknown>;
}

export interface Split { key: string; enrolled: number; completed: number }

export interface CohortReport {
  totals: { enrolled: number; active: number; completed: number; dropped: number; imported: number };
  rates: { completion: number | null; retention: number | null; averageAttendance: number | null; womenCompleted: number | null; youthCompleted: number | null };
  attendanceBands: { band: string; n: number }[];
  breakdowns: { gender: Split[]; age: Split[]; state: Split[]; track: Split[]; disability: Split[] };
}

const NOT_STATED = 'Not stated';
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : NOT_STATED);

function split(ls: CohortLearner[], keyOf: (l: CohortLearner) => string, order: readonly string[] = []): Split[] {
  const map = new Map<string, Split>();
  for (const l of ls) {
    const key = keyOf(l);
    const s = map.get(key) ?? { key, enrolled: 0, completed: 0 };
    s.enrolled += 1;
    if (l.status === 'completed') s.completed += 1;
    map.set(key, s);
  }
  const rank = (k: string) => (k === NOT_STATED ? 1e9 : order.includes(k) ? order.indexOf(k) : 1e8);
  return [...map.values()].sort((a, b) => rank(a.key) - rank(b.key) || b.enrolled - a.enrolled || a.key.localeCompare(b.key));
}

export function buildCohortReport(learners: CohortLearner[], referenceDate: Date): CohortReport {
  const completed = learners.filter((l) => l.status === 'completed');
  const dropped = learners.filter((l) => l.status === 'dropped');
  const rates = learners.flatMap((l) => (l.rate === null ? [] : [l.rate]));
  const age = (l: CohortLearner) => ageOn(l.answers.date_of_birth, referenceDate);
  const withGender = completed.filter((l) => text(l.answers.gender) !== NOT_STATED);
  const withAge = completed.filter((l) => age(l) !== null);
  const bands: [string, (r: number) => boolean][] = [['90% or more', (r) => r >= 90], ['75 to 89%', (r) => r >= 75 && r < 90], ['50 to 74%', (r) => r >= 50 && r < 75], ['Under 50%', (r) => r < 50]];

  return {
    totals: {
      enrolled: learners.length,
      active: learners.filter((l) => l.status === 'active').length,
      completed: completed.length,
      dropped: dropped.length,
      imported: learners.filter((l) => l.source === 'imported').length,
    },
    rates: {
      completion: pct(completed.length, learners.length),
      retention: pct(learners.length - dropped.length, learners.length),
      averageAttendance: rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : null,
      womenCompleted: pct(withGender.filter((l) => text(l.answers.gender).toLowerCase() === 'female').length, withGender.length),
      youthCompleted: pct(withAge.filter((l) => { const n = age(l)!; return n >= 18 && n <= 35; }).length, withAge.length),
    },
    attendanceBands: bands.map(([band, test]) => ({ band, n: rates.filter(test).length })),
    breakdowns: {
      gender: split(learners, (l) => text(l.answers.gender), ['Female', 'Male']),
      age: split(learners, (l) => ageBand(age(l)), AGE_BANDS),
      state: split(learners, (l) => text(l.answers.state_of_residence)),
      track: split(learners, (l) => l.track ?? NOT_STATED),
      disability: split(learners, (l) => text(l.answers.disability), ['Yes', 'No']),
    },
  };
}
