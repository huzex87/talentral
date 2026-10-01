import { describe, expect, it } from 'vitest';
import {
  G3, applicationProgress, canWithdraw, confirmationOf, countStatus, employerEngaged, g3Criteria, g3Summary, rankApplicants,
  retentionDueOn, retentionMessageDue, retentionState, type ApplicationLike, type G3Enrolment,
} from '../src/outcomes';

const app = (over: Partial<ApplicationLike>): ApplicationLike => ({ interest: 'confirmed', stage: 'shortlisted', withdrawn_at: null, role_status: 'open', ...over });

describe('applications', () => {
  it('says where an application stands, in English and Hausa', () => {
    expect(applicationProgress(app({}))).toMatchObject({ state: 'active', step: 1, en: 'Being reviewed', ha: 'Ana dubawa' });
    expect(applicationProgress(app({ stage: 'interviewed' }))).toMatchObject({ state: 'active', step: 2, en: 'Interviewing' });
    expect(applicationProgress(app({ stage: 'offered' }))).toMatchObject({ step: 3, tone: 'violet' });
    expect(applicationProgress(app({ stage: 'placed' }))).toMatchObject({ state: 'hired', step: 4, tone: 'teal' });
    expect(applicationProgress(app({ stage: 'declined' }))).toMatchObject({ state: 'not_selected', en: 'Not selected this time' });
    expect(applicationProgress(app({ interest: 'pending' }))).toMatchObject({ state: 'invited', step: -1 });
    expect(applicationProgress(app({ interest: 'declined' }))).toMatchObject({ state: 'said_no' });
    expect(applicationProgress(app({ interest: 'declined', withdrawn_at: new Date() }))).toMatchObject({ state: 'withdrawn' });
    expect(applicationProgress(app({ role_status: 'filled' }))).toMatchObject({ state: 'closed' });
    // A hire stands even after the job is marked filled.
    expect(applicationProgress(app({ stage: 'placed', role_status: 'filled' })).state).toBe('hired');
  });

  it('lets learners withdraw only while still in the running', () => {
    expect(canWithdraw(app({}))).toBe(true);
    expect(canWithdraw(app({ stage: 'offered' }))).toBe(true);
    expect(canWithdraw(app({ stage: 'placed' }))).toBe(false);
    expect(canWithdraw(app({ stage: 'declined' }))).toBe(false);
    expect(canWithdraw(app({ interest: 'pending' }))).toBe(false);
    expect(canWithdraw(app({ withdrawn_at: '2026-10-01' }))).toBe(false);
  });

  it('ranks applicants by match, then by who applied first', () => {
    const list = [
      { id: 'late-strong', match_score: 80, applied_at: '2026-10-03', created_at: '2026-10-03' },
      { id: 'early-strong', match_score: 80, applied_at: '2026-10-01', created_at: '2026-10-01' },
      { id: 'unscored', match_score: null, applied_at: null, created_at: '2026-09-01' },
      { id: 'weak', match_score: 30, applied_at: '2026-09-20', created_at: '2026-09-20' },
    ];
    expect(rankApplicants(list).map((x) => x.id)).toEqual(['early-strong', 'late-strong', 'weak', 'unscored']);
  });
});

describe('placements and the 90-day check', () => {
  it('labels who confirmed a hire', () => {
    expect(confirmationOf({ placement_confirmed_at: null, placement_confirmation: null })).toBe('awaiting');
    expect(confirmationOf({ placement_confirmed_at: new Date(), placement_confirmation: 'officer' })).toBe('officer');
    expect(confirmationOf({ placement_confirmed_at: new Date(), placement_confirmation: 'employer' })).toBe('employer');
  });

  it('opens the check 90 days after the start and calls it overdue two weeks later', () => {
    expect(retentionDueOn('2026-07-01')).toBe('2026-09-29');
    const p = { start_date: '2026-07-01', retained: null };
    expect(retentionState(p, '2026-09-28')).toBe('not_due');
    expect(retentionState(p, '2026-09-29')).toBe('due');
    expect(retentionState(p, '2026-10-12')).toBe('due');
    expect(retentionState(p, '2026-10-13')).toBe('overdue');
    expect(retentionState({ ...p, retained: true }, '2026-10-13')).toBe('retained');
    expect(retentionState({ ...p, retained: false }, '2026-08-01')).toBe('left');
    expect(retentionState({ start_date: null, retained: null }, '2026-10-13')).toBe('not_due');
  });

  it('asks the employer once, then reminds once a week later', () => {
    const base = { start_date: '2026-07-01', retained: null, asked: false, reminded: false };
    expect(retentionMessageDue(base, '2026-09-28')).toBeNull();
    expect(retentionMessageDue(base, '2026-09-29')).toBe('ask');
    expect(retentionMessageDue({ ...base, asked: true }, '2026-10-05')).toBeNull();
    expect(retentionMessageDue({ ...base, asked: true }, '2026-10-06')).toBe('remind');
    expect(retentionMessageDue({ ...base, asked: true, reminded: true }, '2026-11-30')).toBeNull();
    expect(retentionMessageDue({ ...base, retained: true }, '2026-10-06')).toBeNull();
  });
});

describe('Gate G3', () => {
  const row = (over: Partial<G3Enrolment>): G3Enrolment => ({ status: 'active', cohortEnded: false, assessed: false, placed: false, confirmed: false, retained: null, retentionDue: false, ...over });

  it('measures completion among ended cohorts and readiness among completers', () => {
    const rows = [
      row({ status: 'completed', cohortEnded: true, assessed: true, placed: true, confirmed: true, retained: true }),
      row({ status: 'completed', cohortEnded: true, assessed: true, placed: true, retained: false }),
      row({ status: 'completed', cohortEnded: true, assessed: false }),
      row({ status: 'dropped', cohortEnded: true }),
      row({ status: 'active', cohortEnded: true }),
      // Still running: not counted for completion, unless they already completed.
      row({ status: 'active' }),
      row({ status: 'completed', assessed: true, placed: true, retentionDue: true }),
    ];
    const r = g3Summary(rows);
    expect(r.completion).toEqual({ rate: 67, count: 4, of: 6 });
    expect(r.assessed).toEqual({ rate: 75, count: 3, of: 4 });
    expect(r.placements).toBe(3);
    expect(r.confirmed).toBe(1);
    expect(r.retention).toEqual({ rate: 50, count: 1, of: 2 });
    expect(r.retentionDue).toBe(1);
    expect(g3Summary([]).completion.rate).toBeNull();
  });

  it('turns the figures into the four criteria', () => {
    const r = g3Summary([row({ status: 'completed', cohortEnded: true, assessed: true, placed: true })]);
    expect(g3Criteria(r, 7).map((c) => [c.key, c.status])).toEqual([['completion', 'met'], ['assessed', 'met'], ['employers', 'near'], ['placements', 'met']]);
    // Hubs are not measured on employers.
    expect(g3Criteria(g3Summary([]), null).map((c) => [c.key, c.status])).toEqual([['completion', 'none'], ['assessed', 'none'], ['placements', 'below']]);
    expect(countStatus(G3.employersEngaged, G3.employersEngaged)).toBe('met');
    expect(countStatus(6, 10)).toBe('below');
  });

  it('counts an employer as engaged once anything has happened', () => {
    expect(employerEngaged({ jobsPublished: 0, shortlists: 0, candidates: 0 })).toBe(false);
    expect(employerEngaged({ jobsPublished: 1, shortlists: 0, candidates: 0 })).toBe(true);
    expect(employerEngaged({ jobsPublished: 0, shortlists: 1, candidates: 0 })).toBe(true);
    expect(employerEngaged({ jobsPublished: 0, shortlists: 0, candidates: 2 })).toBe(true);
  });
});
