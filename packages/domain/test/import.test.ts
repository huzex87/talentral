import { describe, expect, it } from 'vitest';
import { RECOMMENDED_FIELDS, checkRows, guessMapping, normalisePhone, parseCsv, toIsoDate } from '../src';

describe('CSV parsing', () => {
  it('handles quotes, embedded commas and line breaks, CRLF and a BOM', () => {
    const csv = '﻿Name,Email,Note\r\n"Musa, Aisha",aisha@x.ng,"line one\nline two"\r\nIbrahim Sani,ib@x.ng,"says ""hi"""\r\n\r\n';
    expect(parseCsv(csv)).toEqual([
      ['Name', 'Email', 'Note'],
      ['Musa, Aisha', 'aisha@x.ng', 'line one\nline two'],
      ['Ibrahim Sani', 'ib@x.ng', 'says "hi"'],
    ]);
  });

  it('detects semicolon-separated exports', () => {
    expect(parseCsv('Name;Email\nA B;a@b.ng')).toEqual([['Name', 'Email'], ['A B', 'a@b.ng']]);
  });
});

describe('column matching', () => {
  it('recognises common headings and form questions, and never maps two columns to one field', () => {
    const mapping = guessMapping(['S/N', 'Full Name', 'E-mail Address', 'Phone No.', 'Sex', 'State of Origin', 'Course', 'Email'], RECOMMENDED_FIELDS);
    expect(mapping).toEqual(['ignore', 'full_name', 'email', 'phone', 'answer:gender', 'answer:state_of_residence', 'track', 'ignore']);
  });

  it('supports separate first and last name columns', () => {
    expect(guessMapping(['First Name', 'Surname'], [])).toEqual(['first_name', 'last_name']);
  });
});

describe('dates from spreadsheets', () => {
  it('reads Excel serials, ISO dates and day/month/year', () => {
    expect(toIsoDate('36931')).toBe('2001-02-09'); // 36526 is 1 Jan 2000
    expect(toIsoDate('2001-05-14')).toBe('2001-05-14');
    expect(toIsoDate('14/05/2001')).toBe('2001-05-14');
    expect(toIsoDate('31/02/2001')).toBeNull();
    expect(toIsoDate('soon')).toBeNull();
  });
});

describe('row checks', () => {
  const mapping = guessMapping(['Name', 'Email', 'Phone', 'Gender', 'Track'], RECOMMENDED_FIELDS);

  it('normalises Nigerian phone numbers, including ones that lost the leading zero', () => {
    expect(normalisePhone('0803 123 4567')).toBe('+2348031234567');
    expect(normalisePhone('8031234567')).toBe('+2348031234567');
    expect(normalisePhone('234-803-123-4567')).toBe('+2348031234567');
    expect(normalisePhone('+44 7700 900123')).toBe('+447700900123');
    expect(normalisePhone('')).toBe('');
    expect(normalisePhone('12345')).toBeNull();
  });

  it('accepts good rows, fixes option spelling and flags problems with row numbers', () => {
    const checks = checkRows([
      ['Aisha Musa', 'AISHA@x.ng', '08031234567', 'female', 'software development'],
      ['', 'no-name@x.ng', '', '', ''],
      ['Bad Email', 'not-an-email', '', '', ''],
      ['Dup', 'aisha@x.ng', '', '', ''],
      ['Wrong Track', 'wt@x.ng', '', '', 'Plumbing'],
    ], mapping, RECOMMENDED_FIELDS, ['Software Development', 'Data Analysis']);
    expect(checks[0]).toEqual({ row: 2, errors: [], value: { full_name: 'Aisha Musa', email: 'aisha@x.ng', phone: '+2348031234567', track: 'Software Development', answers: { gender: 'Female' } } });
    expect(checks[1]!.errors).toEqual(['Name is missing.']);
    expect(checks[2]!.errors[0]).toMatch(/not a valid email/);
    expect(checks[3]!.errors).toEqual(['Same email as row 2.']);
    expect(checks[4]!.errors[0]).toMatch(/Track "Plumbing"/);
  });
});
