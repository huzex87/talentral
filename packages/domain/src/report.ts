// The "call for applications and selection complete" milestone report: who applied, who was
// selected, how they compare, and how selection was done. Pure, so the figures funders see are
// covered by tests. Selected means offered a place or accepted.
import { APPLICATION_STATUSES, type ApplicationStatus } from './status';

export interface ReportApplication {
  status: string;
  source: 'applied' | 'imported';
  track: string | null;
  answers: Record<string, unknown>;
  score: number | null; // average percentage across reviewers
  reviews: number;
}

export interface Breakdown { key: string; applicants: number; selected: number }

export interface SelectionReport {
  totals: { applicants: number; applied: number; imported: number; selected: number; accepted: number; offered: number; shortlisted: number; notSelected: number; withdrawn: number };
  rates: { selection: number | null; womenApplicants: number | null; womenSelected: number | null; youthSelected: number | null; disabilitySelected: number | null };
  funnel: { status: ApplicationStatus; n: number }[];
  breakdowns: { gender: Breakdown[]; age: Breakdown[]; state: Breakdown[]; education: Breakdown[]; employment: Breakdown[]; disability: Breakdown[]; track: Breakdown[] };
  scoring: { scored: number; bands: { high: number; mid: number; low: number }; averageSelected: number | null; averageNotSelected: number | null };
}

export const SELECTED: readonly string[] = ['offered', 'accepted'];
export const AGE_BANDS = ['Under 18', '18 to 24', '25 to 29', '30 to 35', '36 and over'] as const;
const NOT_STATED = 'Not stated';

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : NOT_STATED);

// Age in whole years on the reference date (the programme's opening date, or today).
export function ageOn(dob: unknown, on: Date): number | null {
  if (typeof dob !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
  let age = on.getUTCFullYear() - y;
  if (on.getUTCMonth() + 1 < m || (on.getUTCMonth() + 1 === m && on.getUTCDate() < d)) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

export function ageBand(age: number | null): string {
  if (age === null) return NOT_STATED;
  if (age < 18) return 'Under 18';
  if (age <= 24) return '18 to 24';
  if (age <= 29) return '25 to 29';
  if (age <= 35) return '30 to 35';
  return '36 and over';
}

function breakdown(apps: ReportApplication[], keyOf: (a: ReportApplication) => string, order?: readonly string[]): Breakdown[] {
  const map = new Map<string, Breakdown>();
  for (const a of apps) {
    const key = keyOf(a);
    const b = map.get(key) ?? { key, applicants: 0, selected: 0 };
    b.applicants += 1;
    if (SELECTED.includes(a.status)) b.selected += 1;
    map.set(key, b);
  }
  const rows = [...map.values()];
  const rank = (k: string) => (k === NOT_STATED ? 1e9 : order ? (order.indexOf(k) < 0 ? 1e8 : order.indexOf(k)) : 0);
  return rows.sort((a, b) => rank(a.key) - rank(b.key) || b.applicants - a.applicants || a.key.localeCompare(b.key));
}

export function buildSelectionReport(apps: ReportApplication[], referenceDate: Date): SelectionReport {
  const count = (s: string) => apps.filter((a) => a.status === s).length;
  const selected = apps.filter((a) => SELECTED.includes(a.status));
  const notSelected = apps.filter((a) => !SELECTED.includes(a.status) && a.status !== 'withdrawn');
  const isWoman = (a: ReportApplication) => text(a.answers.gender).toLowerCase() === 'female';
  const age = (a: ReportApplication) => ageOn(a.answers.date_of_birth, referenceDate);
  const withGender = (xs: ReportApplication[]) => xs.filter((a) => text(a.answers.gender) !== NOT_STATED);
  const withAge = selected.filter((a) => age(a) !== null);
  const withDisability = selected.filter((a) => ['yes', 'no'].includes(text(a.answers.disability).toLowerCase()));
  const scored = apps.filter((a) => a.score !== null);

  return {
    totals: {
      applicants: apps.length,
      applied: apps.filter((a) => a.source === 'applied').length,
      imported: apps.filter((a) => a.source === 'imported').length,
      selected: selected.length,
      accepted: count('accepted'),
      offered: count('offered'),
      shortlisted: count('shortlisted'),
      notSelected: count('rejected'),
      withdrawn: count('withdrawn'),
    },
    rates: {
      // Of the people who applied through Talentral, the share selected (imports were selected elsewhere).
      selection: pct(selected.filter((a) => a.source === 'applied').length, apps.filter((a) => a.source === 'applied').length),
      womenApplicants: pct(apps.filter(isWoman).length, withGender(apps).length),
      womenSelected: pct(selected.filter(isWoman).length, withGender(selected).length),
      youthSelected: pct(withAge.filter((a) => { const n = age(a)!; return n >= 18 && n <= 35; }).length, withAge.length),
      disabilitySelected: pct(withDisability.filter((a) => text(a.answers.disability).toLowerCase() === 'yes').length, withDisability.length),
    },
    funnel: APPLICATION_STATUSES.map((status) => ({ status, n: count(status) })).filter((f) => f.n > 0),
    breakdowns: {
      gender: breakdown(apps, (a) => text(a.answers.gender), ['Female', 'Male']),
      age: breakdown(apps, (a) => ageBand(age(a)), AGE_BANDS),
      state: breakdown(apps, (a) => text(a.answers.state_of_residence)),
      education: breakdown(apps, (a) => text(a.answers.education), ['Primary', 'Secondary (SSCE)', 'OND / NCE', "HND / Bachelor's degree", 'Postgraduate', 'Other']),
      employment: breakdown(apps, (a) => text(a.answers.employment_status)),
      disability: breakdown(apps, (a) => text(a.answers.disability), ['Yes', 'No']),
      track: breakdown(apps, (a) => a.track ?? NOT_STATED),
    },
    scoring: {
      scored: scored.length,
      bands: {
        high: scored.filter((a) => a.score! >= 70).length,
        mid: scored.filter((a) => a.score! >= 50 && a.score! < 70).length,
        low: scored.filter((a) => a.score! < 50).length,
      },
      averageSelected: avg(selected.flatMap((a) => (a.score === null ? [] : [a.score]))),
      averageNotSelected: avg(notSelected.flatMap((a) => (a.score === null ? [] : [a.score]))),
    },
  };
}
