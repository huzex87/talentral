import { describe, expect, it } from 'vitest';
import { activation, addDays, attendanceShare, gateStatus, npsCategory, npsDue, npsScore, pickSurvey, watToday, weeklyActive, type HealthEnrolment, type NpsSurvey } from '../src/health';

const DAY = 86_400_000;

describe('NPS', () => {
  it('scores promoters minus detractors', () => {
    expect(npsCategory(10)).toBe('promoter');
    expect(npsCategory(7)).toBe('passive');
    expect(npsCategory(6)).toBe('detractor');
    expect(npsScore([10, 9, 9, 8, 7, 3, 0])).toEqual({ score: 14, responses: 7, promoters: 3, passives: 2, detractors: 2 });
    expect(npsScore([])).toEqual({ score: null, responses: 0, promoters: 0, passives: 0, detractors: 0 });
    expect(npsScore([10, 10]).score).toBe(100);
    expect(npsScore([0, 11, -1, 5.5]).responses).toBe(1); // invalid scores ignored
  });

  const now = new Date('2026-10-01T10:00:00Z');
  const ago = (d: number) => new Date(now.getTime() - d * DAY);
  const survey = (over: Partial<NpsSurvey>): NpsSurvey => ({ tenantId: 't1', hubName: 'Hub', cohortId: 'c1', audience: 'learner', startedAt: ago(30), lastAnswered: null, lastDismissed: null, ...over });

  it('asks two weeks in, then every 90 days, and waits 14 days after Not now', () => {
    expect(npsDue(survey({ startedAt: ago(13) }), now)).toBe(false);
    expect(npsDue(survey({ startedAt: ago(14) }), now)).toBe(true);
    expect(npsDue(survey({ lastAnswered: ago(89) }), now)).toBe(false);
    expect(npsDue(survey({ lastAnswered: ago(90) }), now)).toBe(true);
    expect(npsDue(survey({ lastDismissed: ago(3) }), now)).toBe(false);
    expect(npsDue(survey({ lastDismissed: ago(15) }), now)).toBe(true);
  });

  it('picks the newest due survey for the audience and hub', () => {
    const list = [
      survey({ cohortId: 'old', startedAt: ago(200) }),
      survey({ cohortId: 'new', startedAt: ago(20) }),
      survey({ cohortId: 'fresh', startedAt: ago(5) }),
      survey({ cohortId: null, audience: 'staff', tenantId: 't2', startedAt: ago(40) }),
    ];
    expect(pickSurvey(list, 'learner', now)?.cohortId).toBe('new');
    expect(pickSurvey(list, 'staff', now, 't2')?.tenantId).toBe('t2');
    expect(pickSurvey(list, 'staff', now, 't1')).toBeNull();
  });
});

describe('activation and weekly use', () => {
  const today = '2026-10-01';
  const e = (id: string, start: string, over: Partial<HealthEnrolment> = {}): HealthEnrolment => ({ id, cohortId: 'c', status: 'active', start, cohortEnds: null, ...over });

  it('works in WAT calendar days', () => {
    expect(watToday(new Date('2026-09-30T23:30:00Z'))).toBe('2026-10-01');
    expect(addDays('2026-09-28', 7)).toBe('2026-10-05');
  });

  it('counts learners active within 7 days of starting, among those who started a week ago', () => {
    const enrols = [e('a', '2026-09-01'), e('b', '2026-09-01'), e('c', '2026-09-01', { status: 'dropped' }), e('d', '2026-09-28')];
    const days = [{ enrolmentId: 'a', day: '2026-09-03' }, { enrolmentId: 'b', day: '2026-09-20' }, { enrolmentId: 'c', day: '2026-09-08' }, { enrolmentId: 'd', day: '2026-09-29' }];
    // a (day 2) and c (day 7) activated; b first came on day 19; d started too recently to count.
    expect(activation(enrols, days, today)).toEqual({ rate: 67, count: 2, of: 3 });
    expect(activation([], [], today)).toEqual({ rate: null, count: 0, of: 0 });
  });

  it('works out weekly active learners, leaving out dropouts, people not yet started and ended cohorts', () => {
    const enrols = [e('a', '2026-09-01'), e('b', '2026-09-01'), e('c', '2026-09-01', { status: 'dropped' }), e('d', '2026-09-28'), e('f', '2026-08-01', { cohortEnds: '2026-09-10' })];
    const days = [{ enrolmentId: 'a', day: '2026-09-30' }, { enrolmentId: 'a', day: '2026-09-21' }, { enrolmentId: 'b', day: '2026-09-22' }, { enrolmentId: 'c', day: '2026-09-30' }];
    const weeks = weeklyActive(enrols, days, today, 2);
    expect(weeks[0]).toEqual({ weekStart: '2026-09-18', weekEnd: '2026-09-24', rate: 100, count: 2, of: 2 });
    expect(weeks[1]).toEqual({ weekStart: '2026-09-25', weekEnd: '2026-10-01', rate: 33, count: 1, of: 3 });
  });

  it('rates attendance and compares against the gate', () => {
    expect(attendanceShare({ present: 6, late: 1, absent: 3 })).toEqual({ rate: 70, count: 7, of: 10 });
    expect(gateStatus(72, 70)).toBe('met');
    expect(gateStatus(62, 70)).toBe('near');
    expect(gateStatus(59, 70)).toBe('below');
    expect(gateStatus(null, 70)).toBe('none');
    expect(gateStatus(0, 0, true)).toBe('met');
    expect(gateStatus(1, 0, true)).toBe('below');
  });
});
