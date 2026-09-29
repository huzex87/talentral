import { describe, expect, it } from 'vitest';
import { CHECKIN_CODE, attendanceRate, buildCohortReport, newCheckinCode, standing, type CohortLearner } from '../src';

describe('check-in codes', () => {
  it('are six unambiguous characters', () => {
    for (let i = 0; i < 200; i++) expect(newCheckinCode()).toMatch(CHECKIN_CODE);
    expect(newCheckinCode(() => new Uint8Array([0, 31, 32, 63, 255, 8]))).toBe('A9A99J');
  });
});

describe('attendance', () => {
  it('counts present and late, leaves out excused and treats unmarked as absent', () => {
    expect(attendanceRate(['present', 'late', 'absent', null], 4)).toBe(50);
    expect(attendanceRate(['present', 'excused', 'present'], 3)).toBe(100);
    expect(attendanceRate([], 4)).toBe(0);
    expect(attendanceRate([], 0)).toBeNull();
    expect(attendanceRate(['excused'], 1)).toBeNull();
  });

  it('places learners against the completion bar', () => {
    expect([80, 75, 70, 64.9, null].map((r) => standing(r, 75))).toEqual(['meets', 'meets', 'at_risk', 'below', 'no_sessions']);
  });
});

describe('cohort completion report', () => {
  const l = (status: CohortLearner['status'], rate: number | null, answers: Record<string, unknown> = {}, source: CohortLearner['source'] = 'applied'): CohortLearner =>
    ({ status, rate, track: 'Software', source, answers });
  const r = buildCohortReport([
    l('completed', 95, { gender: 'Female', date_of_birth: '2002-01-01' }),
    l('completed', 80, { gender: 'Male', date_of_birth: '1980-01-01' }, 'imported'),
    l('completed', 76, { gender: 'Female' }),
    l('active', 60, { gender: 'Male' }),
    l('dropped', 20, { gender: 'Female' }),
  ], new Date('2026-12-01T00:00:00Z'));

  it('totals completion, retention and attendance', () => {
    expect(r.totals).toEqual({ enrolled: 5, active: 1, completed: 3, dropped: 1, imported: 1 });
    expect(r.rates).toEqual({ completion: 60, retention: 80, averageAttendance: 66.2, womenCompleted: 66.7, youthCompleted: 50 });
    expect(r.attendanceBands).toEqual([{ band: '90% or more', n: 1 }, { band: '75 to 89%', n: 2 }, { band: '50 to 74%', n: 1 }, { band: 'Under 50%', n: 1 }]);
  });

  it('splits enrolled against completed', () => {
    expect(r.breakdowns.gender).toEqual([{ key: 'Female', enrolled: 3, completed: 2 }, { key: 'Male', enrolled: 2, completed: 1 }]);
  });
});
