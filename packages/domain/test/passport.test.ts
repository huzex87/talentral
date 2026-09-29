import { describe, expect, it } from 'vitest';
import { cleanSkills, matchTalent, passportGaps, payRange, readinessLevel, type TalentProfile } from '../src';

describe('readiness', () => {
  it('follows the published rules', () => {
    expect(readinessLevel({ enrolments: 0, certificates: 0, verified: false })).toBe('not_assessed');
    expect(readinessLevel({ enrolments: 1, certificates: 0, verified: true })).toBe('developing');
    expect(readinessLevel({ enrolments: 1, certificates: 1, verified: false })).toBe('ready');
    expect(readinessLevel({ enrolments: 2, certificates: 1, verified: true })).toBe('ready_verified');
  });
});

describe('passport completeness', () => {
  it('lists what is missing before a learner can be found', () => {
    expect(passportGaps({ headline: '', state: null, skills: ['A'], work_modes: [] })).toHaveLength(4);
    expect(passportGaps({ headline: 'Web developer', state: 'Katsina', skills: ['HTML', 'CSS', 'JS'], work_modes: ['remote'] })).toEqual([]);
  });
  it('cleans skills', () => {
    expect(cleanSkills([' SEO ', 'seo', 'Social   media', '', 'Copywriting'])).toEqual(['SEO', 'Social media', 'Copywriting']);
  });
});

describe('matching', () => {
  const base: TalentProfile = { skills: ['Social media marketing', 'Canva'], tracks: ['Digital Marketing'], state: 'Katsina',
    work_modes: ['remote'], availability: 'immediately', readiness: 'ready_verified' };

  it('explains a strong match', () => {
    const m = matchTalent({ skills: ['social media', 'digital marketing', 'Excel'], work_mode: 'remote', state: null }, base);
    expect(m.matched).toEqual(['social media', 'digital marketing']);
    expect(m.reasons).toContain('Ready and Verified');
    expect(m.concerns).toEqual([]);
    expect(m.score).toBe(73); // 33.3 + 20 + 10 + 5 + 5
  });

  it('ranks skills shown in graded work above skills only listed', () => {
    const role = { skills: ['social media', 'Excel'], work_mode: 'remote' as const, state: null };
    const listed = matchTalent(role, base);
    const shown = matchTalent(role, { ...base, evidenced: ['Social media management'] });
    expect(shown.score).toBeGreaterThan(listed.score);
    expect(shown.reasons).toContain('Shown in graded work: social media');
  });

  it('names the concerns of a weaker one', () => {
    const m = matchTalent({ skills: ['Python'], work_mode: 'on_site', state: 'Kano' },
      { ...base, availability: 'not_looking', readiness: 'developing', work_modes: ['remote'] });
    expect(m.concerns).toEqual(['None of the required skills listed', 'Still in training', 'Has not chosen on site work', 'Lives outside Kano', 'Not looking right now']);
    expect(m.score).toBe(5);
  });
});

describe('pay ranges', () => {
  it('reads naturally in naira', () => {
    expect(payRange(150000, 250000)).toBe('₦150,000 to ₦250,000 a month');
    expect(payRange(100000, null)).toBe('From ₦100,000 a month');
    expect(payRange(null, null)).toBeNull();
  });
});
