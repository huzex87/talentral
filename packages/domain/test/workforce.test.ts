import { describe, expect, it } from 'vitest';
import { matchTalent } from '../src/passport';
import { cacNumberProblem, closingLabel, matchSummary, normaliseCac, portfolioKind, skillStatus, verificationChecks } from '../src/workforce';

describe('labelled skill matches', () => {
  it('gives each required skill its strongest evidence', () => {
    const s = skillStatus(['React', 'HTML and CSS', 'Figma', 'Excel'], { self: ['react', 'Excel'], evidenced: ['HTML/CSS', 'HTML and CSS'], verified: ['React.js'] });
    expect(s).toEqual([
      { skill: 'React', status: 'verified' }, { skill: 'HTML and CSS', status: 'platform' },
      { skill: 'Figma', status: 'missing' }, { skill: 'Excel', status: 'self' },
    ]);
    expect(matchSummary(s)).toEqual({ have: 3, proven: 2, total: 4 });
  });
  it('labels portfolio items', () => {
    expect(portfolioKind({ verified_at: new Date(), submission_id: null })).toBe('verified');
    expect(portfolioKind({ verified_at: null, submission_id: 'x' })).toBe('platform');
    expect(portfolioKind({ verified_at: null, submission_id: null })).toBe('self');
  });
  it('counts verified portfolio skills as proven and relocation as a reason', () => {
    const m = matchTalent({ skills: ['React'], work_mode: 'on_site', state: 'Kano' },
      { skills: [], tracks: [], state: 'Katsina', work_modes: ['on_site'], availability: 'immediately', readiness: 'ready', verified: ['React'], relocate: true });
    expect(m.reasons).toContain('Shown in graded work: React');
    expect(m.reasons).toContain('Willing to relocate to Kano');
    expect(m.concerns).not.toContain('Lives outside Kano');
  });
});

describe('employer verification', () => {
  it('checks CAC numbers', () => {
    expect(cacNumberProblem('')).toBeNull();
    expect(cacNumberProblem('RC1234567')).toBeNull();
    expect(cacNumberProblem('bn 2345678')).toBeNull();
    expect(cacNumberProblem('12345')).toMatch(/RC 1234567/);
    expect(normaliseCac('rc-1234567')).toBe('RC 1234567');
  });
  it('compares the email domain with the website', () => {
    const checks = (email: string, website: string | null) => verificationChecks({ cac_number: 'RC 1', website, contact_email: email, contact_phone: '0803' }).find((c) => c.key === 'email')!;
    expect(checks('hr@sahelfoods.ng', 'https://www.sahelfoods.ng')).toMatchObject({ ok: true });
    expect(checks('hr@mail.sahelfoods.ng', 'https://sahelfoods.ng/about')).toMatchObject({ ok: true });
    expect(checks('boss@gmail.com', 'https://sahelfoods.ng')).toMatchObject({ ok: false, detail: expect.stringMatching(/personal email/) });
    expect(checks('hr@sahelfoods.ng', null)).toMatchObject({ ok: null });
  });
});

describe('jobs', () => {
  it('says when a job closes', () => {
    expect(closingLabel(null, '2026-10-01')).toBeNull();
    expect(closingLabel('2026-10-01', '2026-10-01')).toBe('Closes today');
    expect(closingLabel('2026-10-02', '2026-10-01')).toBe('Closes tomorrow');
    expect(closingLabel('2026-10-06', '2026-10-01')).toBe('Closes in 5 days');
    expect(closingLabel('2026-10-20', '2026-10-01')).toBe('Closes 20 Oct');
    expect(closingLabel('2026-09-30', '2026-10-01')).toBe('Closed');
  });
});
