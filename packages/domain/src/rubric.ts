// Screening rubrics: the criteria a hub scores applicants against, and how scores combine.
// Each reviewer scores every criterion from 0 to its maximum; criteria carry a weight, and an
// applicant's result is the weighted share of the maximum, as a percentage. Several reviewers'
// percentages are averaged, so hubs can split the work and still rank everyone on one scale.
import { z } from 'zod';

export interface Criterion {
  id: string;
  label: string;
  help?: string;
  max: number;    // highest score on this criterion (1 to 10)
  weight: number; // relative importance (1 to 5)
}

export type Scores = Record<string, number>;

export const MAX_CRITERIA = 10;

// A sensible starting point for skills programmes; hubs edit it to suit.
export const DEFAULT_RUBRIC: Criterion[] = [
  { id: 'motivation', label: 'Motivation and commitment', help: 'Clear reasons for joining and evidence they will attend and finish.', max: 5, weight: 3 },
  { id: 'readiness', label: 'Digital readiness', help: 'Basic computer or smartphone skills and access to practise.', max: 5, weight: 2 },
  { id: 'fit', label: 'Fit with the track', help: 'Background or interest that matches the track they chose.', max: 5, weight: 2 },
  { id: 'impact', label: 'Potential impact', help: 'Likelihood the training changes their work or income.', max: 5, weight: 1 },
];

const criterionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/),
  label: z.string().trim().min(2, 'Give each criterion a name.').max(120),
  help: z.string().trim().max(300).optional(),
  max: z.number().int().min(1).max(10),
  weight: z.number().int().min(1).max(5),
});

export function validateRubric(input: unknown): { ok: true; rubric: Criterion[] } | { ok: false; error: string } {
  const parsed = z.array(criterionSchema).max(MAX_CRITERIA, `Use at most ${MAX_CRITERIA} criteria.`).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the criteria.' };
  const ids = new Set<string>();
  for (const c of parsed.data) {
    if (ids.has(c.id)) return { ok: false, error: 'Two criteria share the same identifier.' };
    ids.add(c.id);
  }
  return { ok: true, rubric: parsed.data.map((c) => (c.help ? c : { id: c.id, label: c.label, max: c.max, weight: c.weight })) };
}

// Checks one reviewer's scores against the rubric: every criterion scored, each within range.
export function validateScores(rubric: Criterion[], input: Record<string, unknown>): { ok: true; scores: Scores } | { ok: false; error: string } {
  if (!rubric.length) return { ok: false, error: 'This programme has no screening rubric yet.' };
  const scores: Scores = {};
  for (const c of rubric) {
    const raw = input[c.id];
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw !== '' ? Number(raw) : NaN;
    if (!Number.isInteger(n) || n < 0 || n > c.max) return { ok: false, error: `Score "${c.label}" from 0 to ${c.max}.` };
    scores[c.id] = n;
  }
  return { ok: true, scores };
}

// Weighted percentage, rounded to one decimal place.
export function scorePercent(rubric: Criterion[], scores: Scores): number {
  const possible = rubric.reduce((s, c) => s + c.max * c.weight, 0);
  if (!possible) return 0;
  const got = rubric.reduce((s, c) => s + Math.min(c.max, Math.max(0, scores[c.id] ?? 0)) * c.weight, 0);
  return Math.round((got / possible) * 1000) / 10;
}

// Once anyone has scored, the parts that change the arithmetic (criteria, maximums, weights) are
// frozen so every applicant stays comparable; names and guidance can still be improved.
export function rubricChangeAllowed(before: Criterion[], after: Criterion[]): boolean {
  if (before.length !== after.length) return false;
  return before.every((b, i) => {
    const a = after[i]!;
    return a.id === b.id && a.max === b.max && a.weight === b.weight;
  });
}

export function scoreBand(percent: number | null): 'none' | 'low' | 'mid' | 'high' {
  if (percent === null) return 'none';
  return percent >= 70 ? 'high' : percent >= 50 ? 'mid' : 'low';
}
