// The Impact dashboard: one pass over a hub's learners that funders, programme managers and
// M&E officers all read from. Pure, so every figure is covered by tests.
import { AGE_BANDS, ageBand, ageOn } from './report';
import { READINESS, readinessLevel, type Readiness } from './passport';

export interface ImpactLearner {
  status: 'active' | 'completed' | 'dropped';
  rate: number | null; // attendance percentage
  answers: Record<string, unknown>;
  track: string | null;
  certified: boolean;
  verified: boolean;
  attendedRecently: boolean; // present or late at a session in the last 7 days
  putForward: boolean;
  interviewed: boolean;
  placed: boolean;
}

export interface ImpactApplication { status: string }
export interface ImpactWeek { week: string; held: number; attended: number; marked: number }

export interface ImpactSplit { key: string; enrolled: number; completed: number; certified: number; placed: number }

export interface Impact {
  kpis: {
    applicants: number; enrolled: number; active: number; activeThisWeek: number; averageAttendance: number | null;
    completed: number; completionRate: number | null; certified: number; placed: number; placementRate: number | null;
  };
  funnel: { stage: string; n: number }[];
  readiness: { level: Readiness; label: string; n: number }[];
  splits: { gender: ImpactSplit[]; age: ImpactSplit[]; state: ImpactSplit[]; lga: ImpactSplit[]; disability: ImpactSplit[]; track: ImpactSplit[] };
  weeks: { week: string; held: number; rate: number | null }[];
}

const NOT_STATED = 'Not stated';
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : NOT_STATED);

export function learnerReadiness(l: Pick<ImpactLearner, 'status' | 'certified' | 'verified'>): Readiness {
  return readinessLevel({ enrolments: l.status === 'dropped' ? 0 : 1, certificates: l.certified ? 1 : 0, verified: l.verified });
}

function split(ls: ImpactLearner[], keyOf: (l: ImpactLearner) => string, order: readonly string[] = [], limit?: number): ImpactSplit[] {
  const map = new Map<string, ImpactSplit>();
  for (const l of ls) {
    const key = keyOf(l);
    const s = map.get(key) ?? { key, enrolled: 0, completed: 0, certified: 0, placed: 0 };
    s.enrolled += 1;
    if (l.status === 'completed') s.completed += 1;
    if (l.certified) s.certified += 1;
    if (l.placed) s.placed += 1;
    map.set(key, s);
  }
  const rank = (k: string) => (k === NOT_STATED ? 1e9 : order.includes(k) ? order.indexOf(k) : 1e8);
  const rows = [...map.values()].sort((a, b) => rank(a.key) - rank(b.key) || b.enrolled - a.enrolled || a.key.localeCompare(b.key));
  if (!limit || rows.length <= limit) return rows;
  // Keep the largest groups and fold the rest into "Other", so long lists stay readable.
  const kept = rows.slice(0, limit - 1);
  const rest = rows.slice(limit - 1);
  return [...kept, rest.reduce((o, r) => ({ key: 'Other', enrolled: o.enrolled + r.enrolled, completed: o.completed + r.completed, certified: o.certified + r.certified, placed: o.placed + r.placed }),
    { key: 'Other', enrolled: 0, completed: 0, certified: 0, placed: 0 })];
}

export function buildImpact(applications: ImpactApplication[], learners: ImpactLearner[], weeks: ImpactWeek[], referenceDate: Date): Impact {
  const completed = learners.filter((l) => l.status === 'completed');
  const active = learners.filter((l) => l.status === 'active');
  const rates = learners.flatMap((l) => (l.rate === null ? [] : [l.rate]));
  const age = (l: ImpactLearner) => ageBand(ageOn(l.answers.date_of_birth, referenceDate));
  const count = (f: (l: ImpactLearner) => boolean) => learners.filter(f).length;
  const placed = count((l) => l.placed);
  const readinessCounts = new Map<Readiness, number>();
  for (const l of learners) readinessCounts.set(learnerReadiness(l), (readinessCounts.get(learnerReadiness(l)) ?? 0) + 1);

  return {
    kpis: {
      applicants: applications.length,
      enrolled: learners.length,
      active: active.length,
      activeThisWeek: active.filter((l) => l.attendedRecently).length,
      averageAttendance: rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : null,
      completed: completed.length,
      completionRate: pct(completed.length, learners.length),
      certified: count((l) => l.certified),
      placed,
      placementRate: pct(placed, completed.length),
    },
    funnel: [
      { stage: 'Applied', n: applications.length },
      { stage: 'Selected', n: applications.filter((a) => a.status === 'offered' || a.status === 'accepted').length },
      { stage: 'Enrolled', n: learners.length },
      { stage: 'Completed', n: completed.length },
      { stage: 'Certified', n: count((l) => l.certified) },
      { stage: 'Put forward', n: count((l) => l.putForward) },
      { stage: 'Interviewed', n: count((l) => l.interviewed) },
      { stage: 'Placed in work', n: placed },
    ],
    readiness: (Object.keys(READINESS) as Readiness[]).map((level) => ({ level, label: READINESS[level], n: readinessCounts.get(level) ?? 0 })),
    splits: {
      gender: split(learners, (l) => text(l.answers.gender), ['Female', 'Male']),
      age: split(learners, age, AGE_BANDS),
      state: split(learners, (l) => text(l.answers.state_of_residence), [], 8),
      lga: split(learners, (l) => text(l.answers.lga), [], 10),
      disability: split(learners, (l) => text(l.answers.disability), ['Yes', 'No']),
      track: split(learners, (l) => l.track ?? NOT_STATED),
    },
    weeks: weeks.map((w) => ({ week: w.week, held: w.held, rate: pct(w.attended, w.marked) })),
  };
}
