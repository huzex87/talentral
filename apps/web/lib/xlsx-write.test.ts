import { describe, expect, it } from 'vitest';
import { writeCsv, writeXlsx } from './xlsx-write';

describe('exports', () => {
  it('writes a zip with a worksheet holding text and numbers', () => {
    const bytes = writeXlsx('Learners', ['Name', 'Attendance %'], [['Ãishatu & Co <b>', 92.5], ['Bello', null]]);
    const text = Buffer.from(bytes).toString('utf8');
    expect(bytes[0]).toBe(0x50); // "PK"
    expect(text).toContain('xl/worksheets/sheet1.xml');
    expect(text).toContain('Ãishatu &amp; Co &lt;b&gt;');
    expect(text).toContain('<v>92.5</v>');
  });
  it('writes CSV that Excel opens safely', () => {
    const csv = writeCsv(['A', 'B'], [['=HYPERLINK("x")', 'a,b'], [1, null]]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")","a,b"`);
    expect(csv).toContain('1,\r\n');
  });
});
