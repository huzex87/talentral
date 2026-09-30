import { describe, expect, it } from 'vitest';
import { DEFAULT_LEVELS, averageMarks, criterionMax, levelFor, rubricPercent, sortLevels, validateLevels, type RubricCriterion } from '../src';

const structure: RubricCriterion = { id: 'a', title: 'Structure', levels: DEFAULT_LEVELS };
const style: RubricCriterion = { id: 'b', title: 'Style', levels: [{ label: 'Strong', points: 10 }, { label: 'Weak', points: 0 }] };

describe('rubric levels', () => {
  it('accept the defaults and refuse broken sets', () => {
    expect(validateLevels(DEFAULT_LEVELS)).toBeNull();
    expect(validateLevels([{ label: 'Only', points: 1 }])).toMatch(/2 to 6/);
    expect(validateLevels([{ label: '', points: 1 }, { label: 'B', points: 2 }])).toMatch(/Name every level/);
    expect(validateLevels([{ label: 'A', points: 2 }, { label: 'B', points: 2 }])).toMatch(/different/);
    expect(validateLevels([{ label: 'A', points: 0 }, { label: 'B', points: -1 }])).toMatch(/between 0 and 100/);
    expect(validateLevels([{ label: 'A', points: 0 }, { label: 'B', points: Number.NaN }])).toMatch(/between 0 and 100/);
  });
  it('sort best first and know their maximum', () => {
    expect(sortLevels([{ label: 'Low', points: 1 }, { label: 'High', points: 5 }]).map((l) => l.label)).toEqual(['High', 'Low']);
    expect(criterionMax(DEFAULT_LEVELS)).toBe(4);
  });
  it('have Hausa labels by default', () => {
    for (const l of DEFAULT_LEVELS) expect(l.label_ha).toBeTruthy();
  });
});

describe('rubric scores', () => {
  it('turn marks into a percentage of the maximum, weighting criteria by their points', () => {
    expect(rubricPercent([structure, style], { a: 4, b: 10 })).toBe(100);
    expect(rubricPercent([structure, style], { a: 3, b: 0 })).toBe(21.4); // 3 of 14
    expect(rubricPercent([structure], { a: 2 })).toBe(50);
  });
  it('wait for every criterion and refuse points that are not a level', () => {
    expect(rubricPercent([structure, style], { a: 4 })).toBeNull();
    expect(rubricPercent([structure], { a: 2.5 })).toBeNull();
    expect(rubricPercent([], {})).toBeNull();
  });
  it('find the level for a mark', () => {
    expect(levelFor(structure, 3)?.label).toBe('Good');
    expect(levelFor(structure, 9)).toBeNull();
    expect(levelFor(structure, null)).toBeNull();
  });
  it('average peer marks per criterion', () => {
    expect(averageMarks([{ marks: { a: 4, b: 10 } }, { marks: { a: 3, b: 0 } }, { marks: { a: 2 } }])).toEqual({ a: 3, b: 5 });
    expect(averageMarks([])).toEqual({});
  });
});
