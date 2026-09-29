import { describe, expect, it } from 'vitest';
import {
  AVAILABILITY, AVAILABILITY_HA, INTEREST, INTEREST_HA, JOB_TYPES, JOB_TYPES_HA, LESSON_KINDS, LESSON_KINDS_HA, READINESS, READINESS_HA,
  READINESS_RULES, READINESS_RULES_HA, WORK_MODES, WORK_MODES_HA, formatPhone, isPhoneCode, label, maskPhone, normalizePhone, passportGaps, phoneCodeText,
} from '../src';

describe('normalizePhone', () => {
  it('reads the ways Nigerians write a mobile number', () => {
    for (const input of ['08031234567', '0803 123 4567', '+234 803 123 4567', '2348031234567', '002348031234567', '803-123-4567', '(0803) 123-4567'])
      expect(normalizePhone(input), input).toBe('2348031234567');
    expect(normalizePhone('07061234567')).toBe('2347061234567');
    expect(normalizePhone('09151234567')).toBe('2349151234567');
  });
  it('refuses landlines, short numbers and other countries', () => {
    for (const input of ['', null, '0803123456', '080312345678', '01 234 5678', '+44 7700 900123', '06031234567', '08231234567', 'phone'])
      expect(normalizePhone(input), String(input)).toBeNull();
  });
});

describe('showing numbers', () => {
  it('masks and formats in the local style', () => {
    expect(maskPhone('2348031234567')).toBe('0803 *** 4567');
    expect(formatPhone('2348031234567')).toBe('0803 123 4567');
  });
});

describe('sign-in codes', () => {
  it('are six digits', () => {
    expect(isPhoneCode('123456')).toBe(true);
    expect(isPhoneCode('12345')).toBe(false);
    expect(isPhoneCode('12345a')).toBe(false);
    expect(isPhoneCode(' 123456')).toBe(false);
  });
  it('are sent in the learner’s language and fit one SMS', () => {
    expect(phoneCodeText('482913', 'en')).toContain('482913');
    expect(phoneCodeText('482913', 'ha')).toContain('Lambar shiga');
    for (const l of ['en', 'ha'] as const) expect(phoneCodeText('482913', l).length).toBeLessThanOrEqual(160);
  });
});

describe('Hausa labels', () => {
  it('cover every English key', () => {
    const pairs: [Record<string, string>, Record<string, string>][] = [
      [LESSON_KINDS, LESSON_KINDS_HA], [WORK_MODES, WORK_MODES_HA], [JOB_TYPES, JOB_TYPES_HA], [AVAILABILITY, AVAILABILITY_HA],
      [INTEREST, INTEREST_HA], [READINESS, READINESS_HA], [READINESS_RULES, READINESS_RULES_HA],
    ];
    for (const [en, ha] of pairs) {
      expect(Object.keys(ha).sort()).toEqual(Object.keys(en).sort());
      for (const v of Object.values(ha)) expect(v.trim().length).toBeGreaterThan(0);
    }
  });
  it('pick by language', () => {
    expect(label(WORK_MODES, WORK_MODES_HA, 'remote', 'en')).toBe('Remote');
    expect(label(WORK_MODES, WORK_MODES_HA, 'remote', 'ha')).toBe('Daga nesa');
  });
  it('translate the Passport checklist', () => {
    const empty = { headline: null, state: null, skills: [], work_modes: [] };
    expect(passportGaps(empty)).toHaveLength(4);
    expect(passportGaps(empty, 'ha')).toHaveLength(4);
    expect(passportGaps(empty, 'ha')[2]).toContain('ƙwarewa 3');
  });
});
