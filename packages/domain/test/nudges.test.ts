import { describe, expect, it } from 'vitest';
import { NUDGE_DEFAULTS, daysInactive, engagement, nudgeDue, nudgeSms, validateRule } from '../src';

// 10:00 WAT on a Wednesday (09:00 UTC), outside quiet hours.
const noon = new Date('2026-10-07T09:00:00Z');
const daysAgo = (n: number, from = noon) => new Date(from.getTime() - n * 86_400_000);
const rule = { afterDays: 5, escalateDays: 3 };

describe('nudge rule', () => {
  it('accepts sensible rules and rejects the rest', () => {
    expect(validateRule(NUDGE_DEFAULTS)).toBeNull();
    expect(validateRule({ afterDays: 1, escalateDays: 3 })).toMatch(/2 to 30 days/);
    expect(validateRule({ afterDays: 31, escalateDays: 3 })).toMatch(/2 to 30 days/);
    expect(validateRule({ afterDays: 5, escalateDays: 0 })).toMatch(/1 to 14 days/);
    expect(validateRule({ afterDays: 5.5, escalateDays: 3 })).not.toBeNull();
  });

  it('counts whole days of inactivity', () => {
    expect(daysInactive(daysAgo(4.9), noon)).toBe(4);
    expect(daysInactive(daysAgo(5), noon)).toBe(5);
    expect(daysInactive(new Date(noon.getTime() + 1000), noon)).toBe(0);
  });
});

describe('nudgeDue', () => {
  it('nudges the learner once the quiet spell reaches the rule', () => {
    expect(nudgeDue(rule, { since: daysAgo(4.9), learnerNudgedAt: null, teamAlerted: false }, noon)).toBeNull();
    expect(nudgeDue(rule, { since: daysAgo(5), learnerNudgedAt: null, teamAlerted: false }, noon)).toBe('learner');
  });

  it('tells the team only after the learner nudge and the escalation wait', () => {
    const since = daysAgo(9);
    expect(nudgeDue(rule, { since, learnerNudgedAt: daysAgo(2.5), teamAlerted: false }, noon)).toBeNull();
    expect(nudgeDue(rule, { since, learnerNudgedAt: daysAgo(3), teamAlerted: false }, noon)).toBe('team');
    expect(nudgeDue(rule, { since, learnerNudgedAt: daysAgo(3), teamAlerted: true }, noon)).toBeNull();
  });

  it('sends nothing in quiet hours (21:00 to 07:00 WAT)', () => {
    const late = new Date('2026-10-07T21:30:00Z'); // 22:30 WAT
    const early = new Date('2026-10-07T05:30:00Z'); // 06:30 WAT
    for (const now of [late, early]) expect(nudgeDue(rule, { since: daysAgo(20, now), learnerNudgedAt: null, teamAlerted: false }, now)).toBeNull();
    expect(nudgeDue(rule, { since: daysAgo(20), learnerNudgedAt: null, teamAlerted: false }, new Date('2026-10-07T06:00:00Z'))).toBe('learner'); // 07:00 WAT
  });
});

describe('engagement', () => {
  it('labels learners by how long they have been quiet', () => {
    expect(engagement(daysAgo(1), daysAgo(1), noon)).toBe('active');
    expect(engagement(daysAgo(3), daysAgo(3), noon)).toBe('quiet');
    expect(engagement(daysAgo(5), daysAgo(5), noon)).toBe('inactive');
    expect(engagement(daysAgo(8), daysAgo(8), noon, 10)).toBe('quiet');
  });

  it('shows people who never started, counted from the cohort start', () => {
    expect(engagement(null, daysAgo(0), noon)).toBe('never');
    expect(engagement(null, daysAgo(1), noon)).toBe('never');
    expect(engagement(null, daysAgo(3), noon)).toBe('never');
    expect(engagement(null, daysAgo(6), noon)).toBe('inactive');
  });
});

describe('nudgeSms', () => {
  it('writes the nudge in the learner’s language within one SMS page or two', () => {
    const en = nudgeSms('en', 'Kirkira Innovation Hub', 'Fatima', 6);
    const ha = nudgeSms('ha', 'Kirkira Innovation Hub', 'Fatima', 6);
    expect(en).toContain('Hi Fatima, we have not seen you on Talentral for 6 days');
    expect(ha).toContain('Sannu Fatima');
    expect(ha).toContain('kwana 6');
    for (const t of [en, ha]) { expect(t).toContain('talentral.ng/learn'); expect(t.length).toBeLessThanOrEqual(306); expect(t).not.toMatch(/—|free/i); }
  });
});
