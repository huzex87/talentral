// Importing participants selected outside Talentral from a spreadsheet: reading CSV, matching the
// file's columns to Talentral fields, and checking each row before anything is saved.
import type { FormField } from './forms';

export const IMPORT_STATUSES = ['accepted', 'offered', 'shortlisted', 'submitted'] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];
export const MAX_IMPORT_ROWS = 5000;

// Where a column's values go: a core field, a question on the programme's form, or nowhere.
export type Target = 'full_name' | 'first_name' | 'last_name' | 'email' | 'phone' | 'track' | `answer:${string}` | 'ignore';

export interface ImportRow { full_name: string; email: string; phone: string; track: string; answers: Record<string, string> }
export interface RowCheck { row: number; value?: ImportRow; errors: string[] }

// ---------------------------------------------------------------- CSV

// RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF or LF.
// Semicolon files (common from Excel in some locales) are detected from the header line.
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

// ---------------------------------------------------------------- column matching

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();

const SYNONYMS: Record<string, string[]> = {
  full_name: ['name', 'full name', 'fullname', 'participant name', 'applicant name', 'names', 'participant', 'student name', 'beneficiary name'],
  first_name: ['first name', 'firstname', 'given name', 'forename'],
  last_name: ['last name', 'lastname', 'surname', 'family name'],
  email: ['email', 'e mail', 'email address', 'e mail address', 'mail'],
  phone: ['phone', 'phone number', 'phone no', 'mobile', 'mobile number', 'telephone', 'gsm', 'whatsapp', 'whatsapp number', 'contact number', 'tel'],
  track: ['track', 'course', 'programme track', 'program track', 'specialisation', 'specialization', 'stream', 'pathway', 'skill', 'skill area'],
  gender: ['gender', 'sex'],
  date_of_birth: ['date of birth', 'dob', 'birth date', 'birthday'],
  state_of_residence: ['state', 'state of residence', 'state of origin', 'residence state', 'location'],
  lga: ['lga', 'local government', 'local government area'],
  education: ['education', 'highest education', 'qualification', 'highest qualification', 'education level'],
  employment_status: ['employment', 'employment status', 'occupation status', 'work status'],
  disability: ['disability', 'pwd', 'person with disability', 'living with disability'],
};

// Best guess for a column, from its heading. Form questions match on their id or label.
export function guessTarget(header: string, fields: FormField[], taken: Set<string>): Target {
  const h = norm(header);
  if (!h) return 'ignore';
  const free = (t: Target) => !taken.has(t);
  for (const [key, words] of Object.entries(SYNONYMS)) {
    if (!words.includes(h)) continue;
    if (['full_name', 'first_name', 'last_name', 'email', 'phone', 'track'].includes(key)) {
      if (free(key as Target)) return key as Target;
    } else if (fields.some((f) => f.id === key && f.type !== 'file') && free(`answer:${key}`)) return `answer:${key}`;
  }
  const byLabel = fields.find((f) => f.type !== 'file' && (norm(f.label) === h || norm(f.id) === h));
  if (byLabel && free(`answer:${byLabel.id}`)) return `answer:${byLabel.id}`;
  return 'ignore';
}

export function guessMapping(headers: string[], fields: FormField[]): Target[] {
  const taken = new Set<string>();
  return headers.map((h) => {
    const t = guessTarget(h, fields, taken);
    if (t !== 'ignore') taken.add(t);
    return t;
  });
}

// ---------------------------------------------------------------- row checks

// Dates arrive as Excel serial numbers (e.g. 36931), as ISO dates, or as Nigerian-style
// day/month/year. Returns YYYY-MM-DD, or null when the value is not a recognisable date.
export function toIsoDate(v: string): string | null {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial < 1 || serial > 80_000) return null;
    return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
  }
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
    if (date.getUTCDate() === Number(d) && date.getUTCMonth() === Number(mo) - 1) return date.toISOString().slice(0, 10);
  }
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Nigerian numbers in any common form (0803..., 234803..., +234 803...) become +234XXXXXXXXXX;
// other international numbers are kept as written.
export function normalisePhone(raw: string): string | null {
  const s = raw.replace(/[\s().-]/g, '');
  if (!s) return '';
  if (/^0[789][01]\d{8}$/.test(s)) return `+234${s.slice(1)}`;
  if (/^[789][01]\d{8}$/.test(s)) return `+234${s}`; // leading zero lost in a spreadsheet
  if (/^\+?234[789][01]\d{8}$/.test(s)) return `+${s.replace(/^\+/, '')}`;
  if (/^\+\d{8,15}$/.test(s)) return s;
  return null;
}

export function checkRows(rows: string[][], mapping: Target[], fields: FormField[], tracks: string[]): RowCheck[] {
  const seen = new Map<string, number>();
  const byId = new Map(fields.map((f) => [f.id, f]));
  return rows.map((cells, i) => {
    const errors: string[] = [];
    const get = (t: Target) => {
      const idx = mapping.indexOf(t);
      return idx >= 0 ? String(cells[idx] ?? '').trim() : '';
    };
    const full = get('full_name') || [get('first_name'), get('last_name')].filter(Boolean).join(' ');
    const email = get('email').toLowerCase();
    const phoneRaw = get('phone');
    const phone = normalisePhone(phoneRaw);
    let track = get('track');

    if (full.length < 2) errors.push('Name is missing.');
    if (full.length > 160) errors.push('Name is too long.');
    if (!EMAIL.test(email)) errors.push(email ? `"${email}" is not a valid email.` : 'Email is missing.');
    if (phone === null) errors.push(`"${phoneRaw}" is not a valid phone number.`);
    if (track && tracks.length) {
      const match = tracks.find((t) => norm(t) === norm(track));
      if (match) track = match;
      else errors.push(`Track "${track}" is not one of: ${tracks.join(', ')}.`);
    }
    if (email && EMAIL.test(email)) {
      const first = seen.get(email);
      if (first !== undefined) errors.push(`Same email as row ${first + 2}.`);
      else seen.set(email, i);
    }

    const answers: Record<string, string> = {};
    mapping.forEach((t, idx) => {
      if (!t.startsWith('answer:')) return;
      const id = t.slice(7);
      const v = String(cells[idx] ?? '').trim().slice(0, 3000);
      if (!v) return;
      const f = byId.get(id);
      if (f?.type === 'date') { answers[id] = toIsoDate(v) ?? v; return; }
      // Match option spelling case-insensitively so "female" lands as "Female".
      const opt = f?.options?.find((o) => norm(o) === norm(v));
      answers[id] = opt ?? v;
    });

    return errors.length
      ? { row: i + 2, errors }
      : { row: i + 2, errors, value: { full_name: full.replace(/\s+/g, ' '), email, phone: phone ?? '', track, answers } };
  });
}
