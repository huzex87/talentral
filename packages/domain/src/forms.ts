// Application forms: a hub configures a list of fields per programme; applicants' answers are
// validated against the same definition on the device and on the server.
import { z } from 'zod';
import { NIGERIAN_STATES } from './nigeria';

export const FIELD_TYPES = ['short_text', 'long_text', 'number', 'date', 'select', 'multi_select', 'yes_no', 'file'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FormField {
  id: string;                // stable key used in answers, a-z, 0-9 and underscores
  label: string;
  type: FieldType;
  required: boolean;
  help?: string;
  options?: string[];        // select and multi_select
  maxLength?: number;        // short_text and long_text
  accept?: string[];         // file: allowed MIME types
}

// Identity fields every application collects. They are stored in columns, not in answers,
// and the form builder shows them as fixed.
export const CORE_FIELDS = ['full_name', 'email', 'phone', 'track', 'consent'] as const;
export const CORE_FIELD_LABELS: Record<(typeof CORE_FIELDS)[number], string> = {
  full_name: 'Full name',
  email: 'Email address',
  phone: 'Phone number',
  track: 'Track',
  consent: 'Consent to data processing',
};

export const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FIELDS = 40;

// Fields most programmes need for eligibility checks and funder disaggregation.
export const RECOMMENDED_FIELDS: FormField[] = [
  { id: 'gender', label: 'Gender', type: 'select', required: true, options: ['Female', 'Male', 'Prefer not to say'] },
  { id: 'date_of_birth', label: 'Date of birth', type: 'date', required: true },
  { id: 'state_of_residence', label: 'State of residence', type: 'select', required: true, options: [...NIGERIAN_STATES] },
  { id: 'lga', label: 'Local government area (LGA)', type: 'short_text', required: true, maxLength: 80 },
  { id: 'education', label: 'Highest level of education', type: 'select', required: true,
    options: ['Primary', 'Secondary (SSCE)', 'OND / NCE', 'HND / Bachelor\'s degree', 'Postgraduate', 'Other'] },
  { id: 'employment_status', label: 'Current employment status', type: 'select', required: true,
    options: ['Unemployed', 'Student', 'Self-employed', 'Employed part-time', 'Employed full-time'] },
  { id: 'disability', label: 'Do you live with a disability?', type: 'select', required: false, options: ['No', 'Yes', 'Prefer not to say'] },
  { id: 'motivation', label: 'Why do you want to join this programme?', type: 'long_text', required: true, maxLength: 1500 },
];

const FIELD_ID = /^[a-z][a-z0-9_]{1,39}$/;

// Checks a form definition before it is saved. Returns a list of problems in plain language.
export function validateFormDefinition(fields: FormField[]): string[] {
  const problems: string[] = [];
  if (fields.length > MAX_FIELDS) problems.push(`A form can have at most ${MAX_FIELDS} questions.`);
  const seen = new Set<string>();
  fields.forEach((f, i) => {
    const where = `Question ${i + 1}${f.label ? ` ("${f.label}")` : ''}`;
    if (!FIELD_ID.test(f.id)) problems.push(`${where} has an invalid key.`);
    if ((CORE_FIELDS as readonly string[]).includes(f.id)) problems.push(`${where} uses a reserved key.`);
    if (seen.has(f.id)) problems.push(`${where} repeats the key "${f.id}".`);
    seen.add(f.id);
    if (!f.label.trim()) problems.push(`${where} needs a question.`);
    if (f.label.length > 200) problems.push(`${where} is longer than 200 characters.`);
    if (!FIELD_TYPES.includes(f.type)) problems.push(`${where} has an unknown type.`);
    if ((f.type === 'select' || f.type === 'multi_select')) {
      const opts = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) problems.push(`${where} needs at least two options.`);
      if (new Set(opts).size !== opts.length) problems.push(`${where} has duplicate options.`);
    }
  });
  return problems;
}

// Turns a label into a field key, unique within the form.
export function fieldIdFromLabel(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let base = label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
  if (!/^[a-z]/.test(base)) base = `q_${base}`.slice(0, 32);
  if (base.length < 2) base = 'question';
  let id = base;
  for (let n = 2; used.has(id) || (CORE_FIELDS as readonly string[]).includes(id); n += 1) id = `${base}_${n}`;
  return id;
}

const PHONE = /^\+?[0-9][0-9\s-]{6,18}$/;

export interface FileAnswer { name: string; type: string; size: number }

// Zod schema for one submission. File answers are validated as metadata; the bytes are checked
// separately where the upload is received.
export function answerSchema(fields: FormField[], tracks: string[]) {
  const core = z.object({
    full_name: z.string().trim().min(3, 'Enter your full name.').max(120),
    email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(160),
    phone: z.string().trim().regex(PHONE, 'Enter a valid phone number, for example 0803 123 4567.'),
    track: tracks.length ? z.enum(tracks as [string, ...string[]], { message: 'Choose a track.' }) : z.string().optional(),
    consent: z.literal(true, { message: 'You must agree before you can apply.' }),
  });

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let s: z.ZodTypeAny;
    switch (f.type) {
      case 'short_text':
        s = z.string().trim().max(f.maxLength ?? 200);
        break;
      case 'long_text':
        s = z.string().trim().max(f.maxLength ?? 3000);
        break;
      case 'number':
        s = z.coerce.number({ message: 'Enter a number.' }).finite();
        break;
      case 'date':
        s = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date.').refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a valid date.');
        break;
      case 'select':
        s = z.enum((f.options ?? ['']) as [string, ...string[]], { message: 'Choose an option.' });
        break;
      case 'multi_select':
        s = z.array(z.enum((f.options ?? ['']) as [string, ...string[]])).max((f.options ?? []).length);
        break;
      case 'yes_no':
        s = z.enum(['yes', 'no'], { message: 'Choose yes or no.' });
        break;
      case 'file':
        s = z.object({
          name: z.string().min(1).max(200),
          type: z.string().refine((t) => (f.accept ?? FILE_TYPES).includes(t), 'Upload a PDF, JPEG or PNG file.'),
          size: z.number().int().positive().max(MAX_FILE_BYTES, 'Files must be 5 MB or smaller.'),
        });
        break;
      default:
        s = z.never();
    }
    if (f.required) {
      if (f.type === 'short_text' || f.type === 'long_text') s = (s as z.ZodString).min(1, 'This question is required.');
      if (f.type === 'multi_select') s = (s as z.ZodArray<z.ZodTypeAny>).min(1, 'Choose at least one option.');
      shape[f.id] = s;
    } else {
      shape[f.id] = z.preprocess((v) => (v === '' || v === null || (Array.isArray(v) && v.length === 0) ? undefined : v), s.optional());
    }
  }
  return core.extend({ answers: z.object(shape).strict() });
}

export type Submission = z.infer<ReturnType<typeof answerSchema>>;

// Maps zod issues to { fieldKey: message } for display next to each question.
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] === 'answers' ? String(issue.path[1] ?? 'answers') : String(issue.path[0] ?? 'form');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
