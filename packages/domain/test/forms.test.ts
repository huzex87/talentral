import { describe, expect, it } from 'vitest';
import { RECOMMENDED_FIELDS, answerSchema, fieldErrors, fieldIdFromLabel, validateFormDefinition, type FormField } from '../src';

const base = { full_name: 'Aisha Musa', email: 'Aisha@Example.com ', phone: '0803 123 4567', consent: true };

describe('validateFormDefinition', () => {
  it('accepts the recommended fields', () => {
    expect(validateFormDefinition(RECOMMENDED_FIELDS)).toEqual([]);
  });
  it('rejects reserved and duplicate keys, empty questions and thin option lists', () => {
    const fields: FormField[] = [
      { id: 'email', label: 'Email', type: 'short_text', required: true },
      { id: 'q_one', label: '', type: 'short_text', required: true },
      { id: 'q_one', label: 'Again', type: 'select', required: true, options: ['Only'] },
    ];
    const problems = validateFormDefinition(fields);
    expect(problems.join(' ')).toMatch(/reserved key/);
    expect(problems.join(' ')).toMatch(/needs a question/);
    expect(problems.join(' ')).toMatch(/repeats the key/);
    expect(problems.join(' ')).toMatch(/at least two options/);
  });
});

describe('fieldIdFromLabel', () => {
  it('makes readable unique keys that avoid core fields', () => {
    expect(fieldIdFromLabel('Why do you want to join?', [])).toBe('why_do_you_want_to_join');
    expect(fieldIdFromLabel('Email', [])).toBe('email_2');
    expect(fieldIdFromLabel('Laptop', ['laptop'])).toBe('laptop_2');
    expect(fieldIdFromLabel('2024 results', [])).toBe('q_2024_results');
  });
});

describe('answerSchema', () => {
  const schema = answerSchema(RECOMMENDED_FIELDS, ['Digital Marketing', 'Software']);
  const answers = {
    gender: 'Female', date_of_birth: '2000-04-12', state_of_residence: 'Katsina', lga: 'Katsina',
    education: 'OND / NCE', employment_status: 'Unemployed', motivation: 'I want to build a career in tech.',
  };

  it('accepts a complete submission and normalises the email', () => {
    const r = schema.safeParse({ ...base, track: 'Software', answers });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('aisha@example.com');
  });

  it('reports each missing or invalid answer against its question', () => {
    const r = schema.safeParse({ ...base, consent: false, track: 'Cooking', answers: { ...answers, gender: 'Other', motivation: '' } });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errs = fieldErrors(r.error);
      expect(Object.keys(errs).sort()).toEqual(['consent', 'gender', 'motivation', 'track']);
    }
  });

  it('treats blank optional answers as absent and rejects unknown keys', () => {
    const ok = schema.safeParse({ ...base, track: 'Software', answers: { ...answers, disability: '' } });
    expect(ok.success).toBe(true);
    const extra = schema.safeParse({ ...base, track: 'Software', answers: { ...answers, salary: '1' } });
    expect(extra.success).toBe(false);
  });

  it('checks file metadata', () => {
    const s = answerSchema([{ id: 'cv', label: 'CV', type: 'file', required: true }], []);
    expect(s.safeParse({ ...base, answers: { cv: { name: 'cv.pdf', type: 'application/pdf', size: 1000 } } }).success).toBe(true);
    expect(s.safeParse({ ...base, answers: { cv: { name: 'cv.exe', type: 'application/x-msdownload', size: 1000 } } }).success).toBe(false);
    expect(s.safeParse({ ...base, answers: { cv: { name: 'big.pdf', type: 'application/pdf', size: 9e6 } } }).success).toBe(false);
  });
});
