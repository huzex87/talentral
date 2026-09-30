import { describe, expect, it } from 'vitest';
import { questionsFromPositions } from '../src';

describe('questionsFromPositions', () => {
  it('letters the options and maps right answers by position', () => {
    const [q] = questionsFromPositions([{ kind: 'single', prompt: ' Which is a cost? ', options: ['Rent', 'Sales', 'Profit'], correct: [0], explanation: 'Rent is paid out.' }]);
    expect(q).toEqual({ kind: 'single', prompt: 'Which is a cost?', options: [{ id: 'a', text: 'Rent' }, { id: 'b', text: 'Sales' }, { id: 'c', text: 'Profit' }], correct: ['a'], points: 1, explanation: 'Rent is paid out.' });
  });

  it('keeps several right answers for multiple, without duplicates or out-of-range positions', () => {
    const [q] = questionsFromPositions([{ kind: 'multiple', prompt: 'Tick the costs', options: ['Rent', 'Fuel', 'Sales'], correct: [1, 0, 1, 7, -1] }]);
    expect(q!.correct).toEqual(['b', 'a']);
    expect(q!.explanation).toBeNull();
  });

  it('uses the standard true and false options and reads the chosen answer', () => {
    const [t, f, byIndex] = questionsFromPositions([
      { kind: 'true_false', prompt: 'A budget is a plan.', options: ['True', 'False'], correct: [0] },
      { kind: 'true_false', prompt: 'Profit is the same as sales.', options: ['True', 'False'], correct: [1] },
      { kind: 'true_false', prompt: 'Records help.', options: [], correct: [1] },
    ]);
    expect(t!.options.map((o) => o.id)).toEqual(['true', 'false']);
    expect(t!.options[0]!.text_ha).toBe('Gaskiya');
    expect(t!.correct).toEqual(['true']);
    expect(f!.correct).toEqual(['false']);
    expect(byIndex!.correct).toEqual(['false']);
  });

  it('drops questions that would fail the editor checks', () => {
    const out = questionsFromPositions([
      { kind: 'single', prompt: 'Two right answers?', options: ['A', 'B', 'C'], correct: [0, 1] },
      { kind: 'single', prompt: 'Only one answer', options: ['A', ' '], correct: [0] },
      { kind: 'single', prompt: 'No right answer', options: ['A', 'B'], correct: [] },
      { kind: 'true_false', prompt: 'No answer given', options: ['True', 'False'], correct: [] },
      { kind: 'single', prompt: '', options: ['A', 'B'], correct: [0] },
      { kind: 'single', prompt: 'Fine', options: ['A', 'B'], correct: [1] },
    ]);
    expect(out.map((q) => q.prompt)).toEqual(['Fine']);
  });

  it('keeps at most eight answers', () => {
    const [q] = questionsFromPositions([{ kind: 'single', prompt: 'Many', options: 'abcdefghij'.split(''), correct: [9] }]);
    expect(q).toBeUndefined();
    const [r] = questionsFromPositions([{ kind: 'single', prompt: 'Many', options: 'abcdefghij'.split(''), correct: [7] }]);
    expect(r!.options).toHaveLength(8);
    expect(r!.correct).toEqual(['h']);
  });
});
