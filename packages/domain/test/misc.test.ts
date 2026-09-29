import { describe, expect, it } from 'vitest';
import { REFERENCE_PATTERN, availability, buttonColor, canMove, contrastRatio, newReference, referencePrefix, slugProblem, slugify } from '../src';

describe('slugs', () => {
  it('slugifies and validates', () => {
    expect(slugify('iDICE Centre of Excellence 2026!')).toBe('idice-centre-of-excellence-2026');
    expect(slugProblem('kirkira', { hub: true })).toBeNull();
    expect(slugProblem('dashboard', { hub: true })).toMatch(/reserved/);
    expect(slugProblem('ab')).not.toBeNull();
    expect(slugProblem('a--b')).not.toBeNull();
  });
});

describe('references', () => {
  it('builds readable references', () => {
    expect(referencePrefix('kirkira')).toBe('KIR');
    expect(referencePrefix('9ja')).toBe('JAX');
    const ref = newReference('KIR', new Date('2026-10-05T00:00:00Z'));
    expect(ref).toMatch(REFERENCE_PATTERN);
    expect(ref.startsWith('KIR-26-')).toBe(true);
  });
});

describe('colours', () => {
  it('falls back to Talentral Blue when a brand colour is unreadable', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 0);
    expect(buttonColor('#0f766e')).toBe('#0F766E');
    expect(buttonColor('#FFD400')).toBe('#2E5BFF');
    expect(buttonColor('not a colour')).toBe('#2E5BFF');
  });
});

describe('status moves and availability', () => {
  it('allows only the defined moves', () => {
    expect(canMove('submitted', 'shortlisted')).toBe(true);
    expect(canMove('submitted', 'accepted')).toBe(false);
    expect(canMove('withdrawn', 'submitted')).toBe(false);
  });
  it('computes availability from status and dates', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(availability({ status: 'draft', opens_at: null, closes_at: null }, now)).toBe('draft');
    expect(availability({ status: 'open', opens_at: '2026-10-12', closes_at: null }, now)).toBe('not_yet_open');
    expect(availability({ status: 'open', opens_at: null, closes_at: '2026-10-09' }, now)).toBe('closed');
    expect(availability({ status: 'open', opens_at: '2026-10-01', closes_at: '2026-10-31' }, now)).toBe('open');
  });
});

import { DEFAULT_RUBRIC, rubricChangeAllowed, scorePercent, validateRubric, validateScores } from '../src/rubric';

describe('screening rubric', () => {
  it('weights criteria and reports a percentage', () => {
    const rubric = [{ id: 'a', label: 'A', max: 5, weight: 3 }, { id: 'b', label: 'B', max: 10, weight: 1 }];
    expect(scorePercent(rubric, { a: 5, b: 10 })).toBe(100);
    expect(scorePercent(rubric, { a: 0, b: 0 })).toBe(0);
    // (4*3 + 5*1) / (5*3 + 10*1) = 17 / 25
    expect(scorePercent(rubric, { a: 4, b: 5 })).toBe(68);
  });

  it('requires every criterion scored within range', () => {
    expect(validateScores(DEFAULT_RUBRIC, { motivation: 5, readiness: 3, fit: 2 }).ok).toBe(false);
    expect(validateScores(DEFAULT_RUBRIC, { motivation: 6, readiness: 3, fit: 2, impact: 1 }).ok).toBe(false);
    expect(validateScores(DEFAULT_RUBRIC, { motivation: '5', readiness: 3, fit: 2, impact: 0 })).toEqual({ ok: true, scores: { motivation: 5, readiness: 3, fit: 2, impact: 0 } });
    expect(validateScores([], {}).ok).toBe(false);
  });

  it('rejects malformed rubrics and duplicate criteria', () => {
    expect(validateRubric(DEFAULT_RUBRIC).ok).toBe(true);
    expect(validateRubric([{ id: 'a', label: 'A', max: 11, weight: 1 }]).ok).toBe(false);
    expect(validateRubric([{ id: 'a', label: 'A', max: 5, weight: 1 }, { id: 'a', label: 'B', max: 5, weight: 1 }]).ok).toBe(false);
  });

  it('freezes the arithmetic once scoring has started, but allows renaming', () => {
    const renamed = DEFAULT_RUBRIC.map((c) => ({ ...c, label: `${c.label}!` }));
    expect(rubricChangeAllowed(DEFAULT_RUBRIC, renamed)).toBe(true);
    expect(rubricChangeAllowed(DEFAULT_RUBRIC, DEFAULT_RUBRIC.slice(1))).toBe(false);
    expect(rubricChangeAllowed(DEFAULT_RUBRIC, DEFAULT_RUBRIC.map((c, i) => (i ? c : { ...c, weight: 5 })))).toBe(false);
  });
});

import { hasPlaceholders, personalise, smsSegments } from '../src/messaging';

describe('bulk messages', () => {
  it('fills placeholders per recipient', () => {
    const r = { full_name: 'Aisha  Musa', reference: 'KIR-26-ABCDE', programme: 'iDICE Cohort 1', hub: 'Kirkira' };
    expect(personalise('Hi {first_name}, {hub} update on {programme} ({reference}).', r)).toBe('Hi Aisha, Kirkira update on iDICE Cohort 1 (KIR-26-ABCDE).');
    expect(hasPlaceholders('Hello all')).toBe(false);
    expect(hasPlaceholders('Hello {first_name}')).toBe(true);
  });

  it('counts SMS segments the way networks bill them', () => {
    expect(smsSegments('a'.repeat(160))).toMatchObject({ segments: 1, unicode: false });
    expect(smsSegments('a'.repeat(161))).toMatchObject({ segments: 2 });
    expect(smsSegments('€'.repeat(80))).toMatchObject({ chars: 160, segments: 1 }); // extension chars cost two
    expect(smsSegments('Barka da zuwa ƙungiya')).toMatchObject({ unicode: true, segments: 1 });
    expect(smsSegments('ƙ'.repeat(71))).toMatchObject({ unicode: true, segments: 2 });
  });
});
