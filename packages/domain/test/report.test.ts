import { describe, expect, it } from 'vitest';
import { ageBand, ageOn, buildSelectionReport, type ReportApplication } from '../src';

const app = (status: string, answers: Record<string, unknown>, extra: Partial<ReportApplication> = {}): ReportApplication =>
  ({ status, source: 'applied', track: 'Software', answers, score: null, reviews: 0, ...extra });

describe('ages', () => {
  const on = new Date('2026-10-01T00:00:00Z');
  it('counts whole years on the reference date', () => {
    expect(ageOn('2001-10-01', on)).toBe(25);
    expect(ageOn('2001-10-02', on)).toBe(24);
    expect(ageOn('not a date', on)).toBeNull();
    expect([17, 18, 24, 25, 35, 36, null].map((a) => ageBand(a))).toEqual(['Under 18', '18 to 24', '18 to 24', '25 to 29', '30 to 35', '36 and over', 'Not stated']);
  });
});

describe('selection report', () => {
  const on = new Date('2026-10-01T00:00:00Z');
  const apps = [
    app('accepted', { gender: 'Female', date_of_birth: '2002-01-01', state_of_residence: 'Katsina', disability: 'Yes' }, { score: 90, reviews: 2 }),
    app('offered', { gender: 'Male', date_of_birth: '1985-06-01', state_of_residence: 'Kano', disability: 'No' }, { score: 70, reviews: 1 }),
    app('accepted', { gender: 'Female', date_of_birth: '2000-03-09' }, { source: 'imported' }),
    app('rejected', { gender: 'Female', state_of_residence: 'Katsina' }, { score: 40, reviews: 1 }),
    app('shortlisted', { gender: 'Male' }, { score: 60, reviews: 1 }),
    app('withdrawn', {}),
  ];
  const r = buildSelectionReport(apps, on);

  it('totals the funnel and separates imported participants', () => {
    expect(r.totals).toEqual({ applicants: 6, applied: 5, imported: 1, selected: 3, accepted: 2, offered: 1, shortlisted: 1, notSelected: 1, withdrawn: 1 });
    expect(r.funnel.map((f) => f.status)).toEqual(['shortlisted', 'offered', 'accepted', 'rejected', 'withdrawn']);
  });

  it('reports inclusion rates only over people who answered', () => {
    expect(r.rates.selection).toBe(40); // 2 of the 5 who applied here; the imported one was selected elsewhere
    expect(r.rates.womenApplicants).toBe(60); // 3 of 5 who stated a gender
    expect(r.rates.womenSelected).toBe(66.7);
    expect(r.rates.youthSelected).toBe(66.7); // 24 and 26 are youth, 41 is not
    expect(r.rates.disabilitySelected).toBe(50); // of the 2 selected who answered
  });

  it('breaks down applicants against selected, with "Not stated" last', () => {
    expect(r.breakdowns.gender).toEqual([
      { key: 'Female', applicants: 3, selected: 2 },
      { key: 'Male', applicants: 2, selected: 1 },
      { key: 'Not stated', applicants: 1, selected: 0 },
    ]);
    expect(r.breakdowns.age.map((b) => b.key)).toEqual(['18 to 24', '25 to 29', '36 and over', 'Not stated']);
    expect(r.breakdowns.state[0]).toEqual({ key: 'Katsina', applicants: 2, selected: 1 });
  });

  it('summarises scoring', () => {
    expect(r.scoring).toEqual({ scored: 4, bands: { high: 2, mid: 1, low: 1 }, averageSelected: 80, averageNotSelected: 50 });
  });

  it('copes with an empty programme', () => {
    const empty = buildSelectionReport([], on);
    expect(empty.rates.selection).toBeNull();
    expect(empty.scoring.averageSelected).toBeNull();
  });
});
