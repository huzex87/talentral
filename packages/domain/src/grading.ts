// Marking rubrics for assignments: criteria with levels, and how marks become a percentage.

export interface RubricLevel { label: string; label_ha?: string | null; points: number; description?: string | null }
export interface RubricCriterion { id: string; title: string; title_ha?: string | null; description?: string | null; description_ha?: string | null; levels: RubricLevel[] }

export const DEFAULT_LEVELS: RubricLevel[] = [
  { label: 'Excellent', label_ha: 'Kyakkyawa sosai', points: 4 },
  { label: 'Good', label_ha: 'Mai kyau', points: 3 },
  { label: 'Fair', label_ha: 'Matsakaici', points: 2 },
  { label: 'Needs work', label_ha: 'Yana buƙatar gyara', points: 1 },
];

// Checks a set of levels as a hub enters them. Returns the problem, or null when they are fine.
export function validateLevels(levels: RubricLevel[]): string | null {
  if (levels.length < 2 || levels.length > 6) return 'Give each criterion 2 to 6 levels.';
  for (const l of levels) {
    if (!l.label.trim() || l.label.length > 40) return 'Name every level (up to 40 characters).';
    if (!Number.isFinite(l.points) || l.points < 0 || l.points > 100) return 'Points for each level must be between 0 and 100.';
  }
  if (new Set(levels.map((l) => l.points)).size !== levels.length) return 'Give each level a different number of points.';
  if (Math.max(...levels.map((l) => l.points)) === 0) return 'At least one level must be worth more than 0 points.';
  return null;
}

// Highest first, so the best level reads first on screen.
export function sortLevels(levels: RubricLevel[]): RubricLevel[] {
  return [...levels].sort((a, b) => b.points - a.points);
}

export function criterionMax(levels: RubricLevel[]): number {
  return levels.reduce((m, l) => Math.max(m, l.points), 0);
}

// The overall percentage for a set of marks (criterion id → points), to one decimal place.
// Null until every criterion has a mark that is one of its levels.
export function rubricPercent(criteria: RubricCriterion[], marks: Record<string, number | null | undefined>): number | null {
  if (!criteria.length) return null;
  let got = 0, max = 0;
  for (const c of criteria) {
    const p = marks[c.id];
    if (p === null || p === undefined || !c.levels.some((l) => l.points === Number(p))) return null;
    got += Number(p);
    max += criterionMax(c.levels);
  }
  return max ? Math.round((got / max) * 1000) / 10 : null;
}

// The level a mark corresponds to, for showing "Good (3 of 4)".
export function levelFor(criterion: RubricCriterion, points: number | null | undefined): RubricLevel | null {
  if (points === null || points === undefined) return null;
  return criterion.levels.find((l) => l.points === Number(points)) ?? null;
}

// Averages of several peer reviews per criterion, for the grader and the learner.
export function averageMarks(reviews: { marks: Record<string, number> }[]): Record<string, number> {
  const sums: Record<string, { total: number; n: number }> = {};
  for (const r of reviews) for (const [k, v] of Object.entries(r.marks ?? {})) {
    const s = (sums[k] ??= { total: 0, n: 0 });
    s.total += Number(v); s.n += 1;
  }
  return Object.fromEntries(Object.entries(sums).map(([k, s]) => [k, Math.round((s.total / s.n) * 10) / 10]));
}
