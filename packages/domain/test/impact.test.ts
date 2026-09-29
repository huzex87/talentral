import { describe, expect, it } from 'vitest';
import { buildImpact, learnerReadiness, type ImpactLearner } from '../src';

const learner = (o: Partial<ImpactLearner>): ImpactLearner => ({
  status: 'active', rate: null, answers: {}, track: null, certified: false, verified: false,
  attendedRecently: false, putForward: false, interviewed: false, placed: false, ...o,
});

describe('impact', () => {
  const on = new Date('2026-10-01');
  const learners = [
    learner({ status: 'completed', rate: 90, certified: true, verified: true, putForward: true, interviewed: true, placed: true,
      answers: { gender: 'Female', date_of_birth: '2004-05-01', state_of_residence: 'Katsina', lga: 'Katsina' } }),
    learner({ status: 'completed', rate: 80, certified: true, putForward: true, answers: { gender: 'Male', date_of_birth: '1990-01-01', lga: 'Funtua' } }),
    learner({ status: 'active', rate: 60, attendedRecently: true, answers: { gender: 'Female' } }),
    learner({ status: 'dropped', rate: 10, answers: {} }),
  ];
  const apps = [{ status: 'accepted' }, { status: 'accepted' }, { status: 'accepted' }, { status: 'accepted' }, { status: 'rejected' }, { status: 'submitted' }];
  const r = buildImpact(apps, learners, [{ week: '2026-09-21', held: 2, attended: 5, marked: 8 }], on);

  it('computes headline indicators', () => {
    expect(r.kpis).toEqual({ applicants: 6, enrolled: 4, active: 1, activeThisWeek: 1, averageAttendance: 60, completed: 2,
      completionRate: 50, certified: 2, placed: 1, placementRate: 50 });
  });

  it('follows people from application to work', () => {
    expect(r.funnel.map((f) => f.n)).toEqual([6, 4, 4, 2, 2, 2, 1, 1]);
  });

  it('applies the published readiness rules to each learner', () => {
    expect(r.readiness.map((x) => [x.level, x.n])).toEqual([['not_assessed', 1], ['developing', 1], ['ready', 1], ['ready_verified', 1]]);
    expect(learnerReadiness({ status: 'dropped', certified: false, verified: false })).toBe('not_assessed');
  });

  it('disaggregates by gender, age and LGA, with placements', () => {
    expect(r.splits.gender[0]).toEqual({ key: 'Female', enrolled: 2, completed: 1, certified: 1, placed: 1 });
    expect(r.splits.age.find((s) => s.key === '18 to 24')?.placed).toBe(1);
    expect(r.splits.lga.map((s) => s.key)).toEqual(['Funtua', 'Katsina', 'Not stated']);
  });

  it('reports weekly attendance as a rate of marked places', () => {
    expect(r.weeks).toEqual([{ week: '2026-09-21', held: 2, rate: 62.5 }]);
  });
});
