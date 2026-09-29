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
