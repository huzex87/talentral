import { describe, expect, it } from 'vitest';
import { nudgeReturns, percent, progressBands, reachShares } from '../src';

describe('progressBands', () => {
  it('puts each learner in a band by share of lessons completed', () => {
    const bands = progressBands([
      { done: 0, total: 8 }, { done: 1, total: 8 }, { done: 2, total: 8 }, { done: 4, total: 8 },
      { done: 6, total: 8 }, { done: 7, total: 8 }, { done: 8, total: 8 }, { done: 9, total: 8 }, { done: 3, total: 0 },
    ]);
    expect(Object.fromEntries(bands.map((b) => [b.band, b.n]))).toEqual({
      'Not started': 1, '1 to 25%': 2, '26 to 50%': 1, '51 to 75%': 1, '76 to 99%': 1, Finished: 2,
    });
  });

  it('keeps every band, in order, even when empty', () => {
    expect(progressBands([]).map((b) => b.band)).toEqual(['Not started', '1 to 25%', '26 to 50%', '51 to 75%', '76 to 99%', 'Finished']);
  });
});

describe('nudgeReturns', () => {
  it('counts learners active again after their latest nudge', () => {
    const t = new Date('2026-10-01T09:00:00Z');
    const later = new Date('2026-10-02T09:00:00Z');
    const earlier = new Date('2026-09-28T09:00:00Z');
    expect(nudgeReturns([{ lastNudge: t, lastActive: later }, { lastNudge: t, lastActive: earlier }, { lastNudge: t, lastActive: null }]))
      .toEqual({ nudged: 3, returned: 1, rate: 33.3 });
    expect(nudgeReturns([])).toEqual({ nudged: 0, returned: 0, rate: null });
  });
});

describe('reachShares', () => {
  it('works out each share among those who answered, and leaves unasked questions unrecorded', () => {
    const on = new Date('2026-10-01T00:00:00Z');
    const shares = reachShares([
      { gender: 'Female', date_of_birth: '2000-05-01', disability: 'No' },
      { gender: 'female ', date_of_birth: '1985-01-01', disability: 'Yes' },
      { gender: 'Male', date_of_birth: '2010-01-01' },
      { gender: 'Prefer not to say', date_of_birth: 'not a date' },
    ], on);
    expect(shares).toEqual({ women: { share: 66.7, answered: 3 }, youth: { share: 33.3, answered: 3 }, disability: { share: 50, answered: 2 } });
    expect(reachShares([{ gender: 'Male' }], on)).toEqual({ women: { share: 0, answered: 1 }, youth: { share: null, answered: 0 }, disability: { share: null, answered: 0 } });
  });

  it('formats a percentage or a dash', () => {
    expect(percent(12.5)).toBe('12.5%');
    expect(percent(null)).toBe('–');
  });
});
