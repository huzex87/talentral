import { describe, expect, it } from 'vitest';
import { brandedFrom, domainProblem, domainRecords, normaliseDomain, pathProgress } from '../src/hubs';

describe('custom domains', () => {
  it('cleans what people paste', () => {
    expect(normaliseDomain(' https://Apply.KirkiraHub.ng/apply/x?y=1 ')).toBe('apply.kirkirahub.ng');
    expect(normaliseDomain('learn.hub.ng.')).toBe('learn.hub.ng');
    expect(normaliseDomain('learn.hub.ng:443')).toBe('learn.hub.ng');
  });

  it('accepts subdomains the hub owns and explains everything else', () => {
    expect(domainProblem('apply.kirkirahub.ng', 'talentral.ng')).toBeNull();
    expect(domainProblem('', 'talentral.ng')).toMatch(/Enter a domain/);
    expect(domainProblem('10.0.0.1', null)).toMatch(/not an IP/);
    expect(domainProblem('not a domain', null)).toMatch(/without https/);
    expect(domainProblem('kirkira.talentral.ng', 'talentral.ng')).toMatch(/already has a Talentral address/);
    expect(domainProblem('talentral.ng', 'talentral.ng')).toMatch(/already has a Talentral address/);
    expect(domainProblem('kirkirahub.ng', 'talentral.ng')).toMatch(/Use a subdomain/);
  });

  it('gives the two DNS records to add', () => {
    expect(domainRecords('apply.hub.ng', 'talentral-abc', 'hubs.talentral.ng')).toEqual([
      { type: 'TXT', host: '_talentral.apply.hub.ng', value: 'talentral-abc', purpose: expect.any(String) },
      { type: 'CNAME', host: 'apply.hub.ng', value: 'hubs.talentral.ng', purpose: expect.any(String) },
    ]);
  });
});

describe('white-label emails', () => {
  it('sends as the hub through Talentral’s address', () => {
    expect(brandedFrom('Kirkira Hub', 'Talentral <no-reply@talentral.ng>')).toBe('"Kirkira Hub via Talentral" <no-reply@talentral.ng>');
    expect(brandedFrom('Bad "name" <x>', 'no-reply@talentral.ng')).toBe('"Bad name x via Talentral" <no-reply@talentral.ng>');
    expect(brandedFrom('  ', 'Talentral <no-reply@talentral.ng>')).toBe('Talentral <no-reply@talentral.ng>');
  });
});

describe('learning paths', () => {
  it('finds the course a learner is on and the share of lessons done', () => {
    expect(pathProgress([{ lessons: 4, done: 4, open: true }, { lessons: 6, done: 2, open: true }, { lessons: 5, done: 0, open: false }]))
      .toEqual({ coursesDone: 1, total: 3, current: 1, percent: 40 });
    // All finished: the last course stays current.
    expect(pathProgress([{ lessons: 2, done: 2, open: true }, { lessons: 1, done: 1, open: true }])).toEqual({ coursesDone: 2, total: 2, current: 1, percent: 100 });
    expect(pathProgress([])).toEqual({ coursesDone: 0, total: 0, current: 0, percent: 0 });
    // An empty course never counts as finished.
    expect(pathProgress([{ lessons: 0, done: 0, open: true }]).coursesDone).toBe(0);
  });
});
