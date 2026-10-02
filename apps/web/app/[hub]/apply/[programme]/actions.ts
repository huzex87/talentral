'use server';
import { redirect } from 'next/navigation';
import { randomBytes } from 'node:crypto';
import { withUser, type Programme } from '@talentral/db';
import { FILE_TYPES, MAX_FILE_BYTES, answerSchema, availability, fieldErrors, newReference, type FormField } from '@talentral/domain';
import { BRAND_COLUMNS, brandOf, type BrandColumns } from '@/lib/brand';
import { applicationReceivedMail, sendMail } from '@/lib/mail';
import { storage } from '@/lib/storage';
import { extensionFor, matchesSignature, safeFileName } from '@/lib/files';
import { hubPath } from '@/lib/urls';

export interface ApplyState {
  attempt: number;
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string | string[]>;
}

type Loaded = Programme & BrandColumns & { hub_slug: string; hub_name: string };

// Where an application's documents live. Uploads are only ever accepted under this prefix.
const filePrefix = (p: Pick<Programme, 'tenant_id' | 'id'>) => `tenants/${p.tenant_id}/applications/${p.id}/`;
const STORED_NAME = /^[0-9a-f]{24}-[\w.-]{1,80}\.(pdf|jpg|png|webp)$/;

// A document that reached storage before the form was sent (see prepareUpload).
interface Uploaded { path: string; name: string; type: string; size: number }

export type PrepareResult = { ok: true; path: string; url: string | null } | { ok: false; error: string };

// Step one of a direct upload: the browser describes the file, and gets back a storage path and a
// short-lived URL to PUT it to. Vercel caps request bodies at 4.5 MB, so documents skip the form.
// Nothing is trusted yet: submitApplication re-reads every uploaded file before accepting it.
export async function prepareUpload(programmeId: string, fieldId: string, name: string, type: string, size: number): Promise<PrepareResult> {
  const [prog] = await withUser(null, (tx) => tx<Programme[]>`select * from public.programmes where id = ${programmeId}`);
  if (!prog || availability(prog) !== 'open') return { ok: false, error: 'Applications for this programme are closed.' };
  const field = (prog.form as FormField[]).find((f) => f.id === fieldId && f.type === 'file');
  if (!field) return { ok: false, error: 'This question does not take a file.' };
  if (!(field.accept ?? FILE_TYPES).includes(type)) return { ok: false, error: 'Upload a PDF, JPEG or PNG file.' };
  if (!Number.isInteger(size) || size <= 0 || size > MAX_FILE_BYTES) return { ok: false, error: 'Files must be 5 MB or smaller.' };

  const path = `${filePrefix(prog)}${randomBytes(12).toString('hex')}-${safeFileName(name).replace(/\.[^.]+$/, '').slice(0, 60) || 'file'}.${extensionFor(type)}`;
  try {
    return { ok: true, path, url: await (await storage()).uploadUrl(path, type) };
  } catch (e) {
    console.error('upload url failed', e);
    return { ok: true, path, url: null };
  }
}

function parseUploaded(raw: FormDataEntryValue | null): Uploaded | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = JSON.parse(raw) as Uploaded;
    return typeof u.path === 'string' && typeof u.name === 'string' && typeof u.type === 'string' && typeof u.size === 'number' ? u : null;
  } catch { return null; }
}

export async function submitApplication(programmeId: string, prev: ApplyState, form: FormData): Promise<ApplyState> {
  const attempt = prev.attempt + 1;
  // Bots fill every field; people never see this one.
  if (String(form.get('website') ?? '')) return { attempt, message: 'Your application could not be sent.' };

  const [prog] = await withUser(null, (tx) => tx<Loaded[]>`
    select p.*, t.slug as hub_slug, t.name as hub_name, ${tx.unsafe(BRAND_COLUMNS)}
    from public.programmes p join public.tenants t on t.id = p.tenant_id where p.id = ${programmeId}`);
  if (!prog) return { attempt, message: 'This programme is no longer available.' };

  const fields = prog.form as FormField[];
  const values: Record<string, string | string[]> = {};
  const files: Record<string, File> = {};
  const uploaded: Record<string, Uploaded> = {};
  const answers: Record<string, unknown> = {};

  for (const f of fields) {
    const key = `a.${f.id}`;
    if (f.type === 'file') {
      const file = form.get(key);
      const ref = parseUploaded(form.get(`${key}.uploaded`));
      if (file instanceof File && file.size > 0) {
        files[f.id] = file;
        answers[f.id] = { name: file.name, type: file.type, size: file.size };
      } else if (ref) {
        uploaded[f.id] = ref;
        values[`${key}.uploaded`] = JSON.stringify(ref); // keeps the attachment if the form comes back with errors
        answers[f.id] = { name: ref.name, type: ref.type, size: ref.size };
      }
    } else if (f.type === 'multi_select') {
      const all = form.getAll(key).map(String);
      values[key] = all;
      answers[f.id] = all;
    } else {
      const v = String(form.get(key) ?? '');
      values[key] = v;
      answers[f.id] = v;
    }
  }
  for (const k of ['full_name', 'email', 'phone', 'track', 'whatsapp']) values[k] = String(form.get(k) ?? '');

  const parsed = answerSchema(fields, prog.tracks).safeParse({
    full_name: values.full_name, email: values.email, phone: values.phone,
    track: prog.tracks.length ? values.track : undefined,
    consent: form.get('consent') === 'on',
    answers,
  });
  if (!parsed.success) {
    return { attempt, values, errors: fieldErrors(parsed.error), message: 'Please check the highlighted answers.' };
  }

  // Check the bytes of each document, not just its name.
  const uploads: { field_id: string; file: File; bytes: Uint8Array }[] = [];
  for (const [fieldId, file] of Object.entries(files)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_FILE_BYTES || !matchesSignature(bytes, file.type)) {
      return { attempt, values, errors: { [fieldId]: 'This file could not be read. Upload a PDF, JPEG or PNG under 5 MB.' }, message: 'Please check the highlighted answers.' };
    }
    uploads.push({ field_id: fieldId, file, bytes });
  }

  const store = await storage();
  const stored: { field_id: string; storage_path: string; filename: string; content_type: string; size_bytes: number }[] = [];
  // Removes this attempt's documents after a failure; the form must then ask for them again.
  const cleanUp = async () => {
    await Promise.all(stored.map((s) => store.remove(s.storage_path).catch(() => {})));
    for (const k of Object.keys(values)) if (k.endsWith('.uploaded')) delete values[k];
  };

  // Documents uploaded directly: they must sit under this programme's prefix, and their stored bytes
  // must match the declared type and size limit, exactly as if they had come with the form.
  for (const [fieldId, ref] of Object.entries(uploaded)) {
    const prefix = filePrefix(prog);
    const bytes = ref.path.startsWith(prefix) && STORED_NAME.test(ref.path.slice(prefix.length)) ? await store.get(ref.path) : null;
    if (!bytes || bytes.byteLength > MAX_FILE_BYTES || !matchesSignature(bytes, ref.type)) {
      if (bytes) await store.remove(ref.path).catch(() => {});
      delete values[`a.${fieldId}.uploaded`];
      return { attempt, values, errors: { [fieldId]: 'This file could not be read. Upload a PDF, JPEG or PNG under 5 MB.' }, message: 'Please check the highlighted answers.' };
    }
    stored.push({ field_id: fieldId, storage_path: ref.path, filename: safeFileName(ref.name), content_type: ref.type, size_bytes: bytes.byteLength });
  }

  try {
    for (const u of uploads) {
      const path = `tenants/${prog.tenant_id}/applications/${prog.id}/${randomBytes(12).toString('hex')}-${safeFileName(u.file.name).replace(/\.[^.]+$/, '')}.${extensionFor(u.file.type)}`;
      await store.put(path, u.bytes, u.file.type);
      stored.push({ field_id: u.field_id, storage_path: path, filename: safeFileName(u.file.name), content_type: u.file.type, size_bytes: u.bytes.byteLength });
    }
  } catch {
    await cleanUp();
    return { attempt, values, message: 'We could not upload your documents. Please try again.' };
  }

  const data = parsed.data;
  let reference = '';
  for (let tries = 0; tries < 5 && !reference; tries += 1) {
    const candidate = newReference(prog.reference_prefix);
    try {
      const [created] = await withUser(null, (tx) => tx<{ id: string }[]>`select app.submit_application(${prog.id}, ${candidate}, ${data.email}, ${data.full_name},
        ${data.phone}, ${data.track ?? ''}, ${tx.json(data.answers as never)}, ${tx.json(stored as never)}) as id`);
      reference = candidate;
      // The applicant ticked "Send me updates on WhatsApp".
      if (form.get('whatsapp') === 'on' && created?.id) {
        await withUser(null, (tx) => tx`select app.application_whatsapp_optin(${created.id}, ${candidate})`).catch((e) => console.error('whatsapp opt-in failed', e));
      }
    } catch (e) {
      const err = e as { code?: string; constraint_name?: string };
      if (err.code === '23505' && err.constraint_name === 'applications_reference_key') continue;
      await cleanUp();
      if (err.code === '23505') {
        return { attempt, values, errors: { email: 'An application with this email address has already been submitted.' }, message: 'You have already applied to this programme.' };
      }
      if (err.code === 'P0001' || err.code === 'P0002') return { attempt, values, message: 'Applications for this programme are closed.' };
      throw e;
    }
  }
  if (!reference) {
    await cleanUp();
    return { attempt, values, message: 'Something went wrong. Please try again.' };
  }

  try {
    await sendMail(applicationReceivedMail(data.email, data.full_name, brandOf(prog.hub_name, prog), prog.title, reference));
  } catch (e) {
    console.error('confirmation email failed', e);
  }
  redirect(hubPath(prog.hub_slug, `/apply/${prog.slug}/submitted?ref=${encodeURIComponent(reference)}`));
}
