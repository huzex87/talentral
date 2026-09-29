import { describe, expect, it } from 'vitest';
import { CERTIFICATE_PATTERN, certificateSerial, completionStanding, weightedScore } from '../src';

describe('weighted scores', () => {
  const defs = [{ id: 'a', max: 20, weight: 1 }, { id: 'b', max: 100, weight: 3 }];
  it('weights each assessment by importance over what has been graded', () => {
    expect(weightedScore(defs, { a: 20, b: 60 })).toEqual({ percent: 70, graded: 2, total: 2 }); // (1*1 + 0.6*3) / 4
    expect(weightedScore(defs, { a: 10 })).toEqual({ percent: 50, graded: 1, total: 2 });
    expect(weightedScore(defs, {})).toEqual({ percent: null, graded: 0, total: 2 });
    expect(weightedScore(defs, { a: 25, b: -5 }).percent).toBe(25); // clamped to 0..max
  });
});

describe('completion rule', () => {
  const none = { percent: null, graded: 0, total: 0 };
  it('uses attendance alone until the cohort has assessments', () => {
    expect(completionStanding(80, 75, none, 50)).toBe('meets');
    expect(completionStanding(70, 75, none, 50)).toBe('at_risk');
    expect(completionStanding(null, 75, none, 50)).toBe('no_sessions');
  });
  it('then requires the pass mark with every assessment graded', () => {
    expect(completionStanding(90, 75, { percent: 65, graded: 2, total: 2 }, 50)).toBe('meets');
    expect(completionStanding(90, 75, { percent: 65, graded: 1, total: 2 }, 50)).toBe('at_risk'); // still being graded
    expect(completionStanding(90, 75, { percent: 45, graded: 2, total: 2 }, 50)).toBe('at_risk');
    expect(completionStanding(90, 75, { percent: 30, graded: 2, total: 2 }, 50)).toBe('below');
    expect(completionStanding(50, 75, { percent: 90, graded: 2, total: 2 }, 50)).toBe('below');
  });
});

describe('certificate serials', () => {
  it('follow the TAL-HUB-YY-XXXXXX pattern', () => {
    for (let i = 0; i < 100; i++) expect(certificateSerial('KIR', new Date('2026-12-01'))).toMatch(CERTIFICATE_PATTERN);
    expect(certificateSerial('KIR', new Date('2026-12-01'), (n) => new Uint8Array(n).fill(1))).toBe('TAL-KIR-26-111111');
  });
});
