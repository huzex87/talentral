'use server';
import { redirect } from 'next/navigation';
import { randomBytes } from 'node:crypto';
import { withUser, type Programme } from '@talentral/db';
import { MAX_FILE_BYTES, answerSchema, fieldErrors, newReference, type FormField } from '@talentral/domain';
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

type Loaded = Programme & { hub_slug: string; hub_name: string };

export async function submitApplication(programmeId: string, prev: ApplyState, form: FormData): Promise<ApplyState> {
  const attempt = prev.attempt + 1;
  // Bots fill every field; people never see this one.
  if (String(form.get('website') ?? '')) return { attempt, message: 'Your application could not be sent.' };

  const [prog] = await withUser(null, (tx) => tx<Loaded[]>`
    select p.*, t.slug as hub_slug, t.name as hub_name
    from public.programmes p join public.tenants t on t.id = p.tenant_id where p.id = ${programmeId}`);
  if (!prog) return { attempt, message: 'This programme is no longer available.' };

  const fields = prog.form as FormField[];
  const values: Record<string, string | string[]> = {};
  const files: Record<string, File> = {};
  const answers: Record<string, unknown> = {};

  for (const f of fields) {
    const key = `a.${f.id}`;
    if (f.type === 'file') {
      const file = form.get(key);
      if (file instanceof File && file.size > 0) {
        files[f.id] = file;
        answers[f.id] = { name: file.name, type: file.type, size: file.size };
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
  for (const k of ['full_name', 'email', 'phone', 'track']) values[k] = String(form.get(k) ?? '');

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
  const cleanUp = () => Promise.all(stored.map((s) => store.remove(s.storage_path).catch(() => {})));
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
      await withUser(null, (tx) => tx`select app.submit_application(${prog.id}, ${candidate}, ${data.email}, ${data.full_name},
        ${data.phone}, ${data.track ?? ''}, ${tx.json(data.answers as never)}, ${tx.json(stored as never)})`);
      reference = candidate;
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
    await sendMail(applicationReceivedMail(data.email, data.full_name, prog.hub_name, prog.title, reference));
  } catch (e) {
    console.error('confirmation email failed', e);
  }
  redirect(hubPath(prog.hub_slug, `/apply/${prog.slug}/submitted?ref=${encodeURIComponent(reference)}`));
}
