// The funder report (E11.3): the figures a funder asks for that the Impact dashboard does not already
// give, worked out purely so every number is covered by tests. Aggregates only: nothing here names a
// learner.
import { ageOn } from './report';

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

export const PROGRESS_BANDS = ['Not started', '1 to 25%', '26 to 50%', '51 to 75%', '76 to 99%', 'Finished'] as const;
export type ProgressBand = (typeof PROGRESS_BANDS)[number];

// How far through the course each learner is, by share of lessons completed.
export function progressBands(rows: { done: number; total: number }[]): { band: ProgressBand; n: number }[] {
  const counts = new Map<ProgressBand, number>(PROGRESS_BANDS.map((b) => [b, 0]));
  for (const r of rows) {
    if (r.total <= 0) continue;
    const share = Math.min(1, Math.max(0, r.done / r.total));
    const band: ProgressBand = share === 0 ? 'Not started' : share >= 1 ? 'Finished' : share <= 0.25 ? '1 to 25%' : share <= 0.5 ? '26 to 50%' : share <= 0.75 ? '51 to 75%' : '76 to 99%';
    counts.set(band, (counts.get(band) ?? 0) + 1);
  }
  return PROGRESS_BANDS.map((band) => ({ band, n: counts.get(band) ?? 0 }));
}

// Of the learners who were nudged, how many came back: any activity after their latest nudge.
export function nudgeReturns(rows: { lastNudge: Date; lastActive: Date | null }[]): { nudged: number; returned: number; rate: number | null } {
  const returned = rows.filter((r) => r.lastActive && r.lastActive.getTime() > r.lastNudge.getTime()).length;
  return { nudged: rows.length, returned, rate: pct(returned, rows.length) };
}

// Who the cohort reached: women, young people (18 to 35 on the cohort's start date) and people with
// a disability, each as a share of those whose application answered the question, so a question the
// form did not ask shows as not recorded rather than as 0%.
export interface ReachShare { share: number | null; answered: number }

export function reachShares(answers: Record<string, unknown>[], on: Date): { women: ReachShare; youth: ReachShare; disability: ReachShare } {
  const said = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
  const stated = (v: unknown) => { const x = said(v); return x !== '' && x !== 'prefer not to say'; };
  const gender = answers.filter((a) => stated(a.gender));
  const ages = answers.flatMap((a) => { const age = ageOn(a.date_of_birth, on); return age === null ? [] : [age]; });
  const disability = answers.filter((a) => stated(a.disability));
  return {
    women: { share: pct(gender.filter((a) => said(a.gender) === 'female').length, gender.length), answered: gender.length },
    youth: { share: pct(ages.filter((age) => age >= 18 && age <= 35).length, ages.length), answered: ages.length },
    disability: { share: pct(disability.filter((a) => said(a.disability) === 'yes').length, disability.length), answered: disability.length },
  };
}

export const percent = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${v}%`);
