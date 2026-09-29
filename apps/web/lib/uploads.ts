import 'server-only';
// Direct uploads, shared by lesson files and learner submissions. The browser asks for a storage
// path and a short-lived URL, PUTs the file straight to storage (Vercel caps request bodies at
// 4.5 MB), then sends only a reference with the form. Nothing is trusted: the reference must sit
// under the expected prefix, and the stored bytes must match the declared type. Where the driver
// cannot sign URLs (local disk), small files travel with the form instead.
import { randomBytes } from 'node:crypto';
import { extensionFor, matchesSignature, safeFileName } from './files';
import { storage } from './storage';

export interface UploadRef { path: string; name: string; type: string; size: number }
export type PrepareResult = { ok: true; path: string; url: string | null } | { ok: false; error: string };
export interface UploadRules { types: string[]; maxBytes: number; label: string }

export async function prepare(prefix: string, rules: UploadRules, name: string, type: string, size: number): Promise<PrepareResult> {
  if (!rules.types.includes(type)) return { ok: false, error: `Choose a ${rules.label.split(',')[0]} file. Allowed: ${rules.label}.` };
  if (!Number.isInteger(size) || size <= 0 || size > rules.maxBytes) return { ok: false, error: `That file is too large. Allowed: ${rules.label}.` };
  const path = `${prefix}${randomBytes(12).toString('hex')}-${safeFileName(name).replace(/\.[^.]+$/, '').slice(0, 60) || 'file'}.${extensionFor(type)}`;
  try {
    return { ok: true, path, url: await (await storage()).uploadUrl(path, type) };
  } catch (e) {
    console.error('upload url failed', e);
    return { ok: true, path, url: null };
  }
}

// Reads the upload from a form: either a reference to a file already in storage, or the file
// itself. Returns the stored file, null when none was given, or an error message.
export async function accept(form: FormData, field: string, prefix: string, rules: UploadRules): Promise<UploadRef | null | { error: string }> {
  const store = await storage();
  const raw = form.get(`${field}.uploaded`);
  if (typeof raw === 'string' && raw) {
    let ref: UploadRef;
    try { ref = JSON.parse(raw) as UploadRef; } catch { return { error: 'The upload was not recognised. Choose the file again.' }; }
    if (typeof ref.path !== 'string' || !ref.path.startsWith(prefix) || ref.path.includes('..') || !rules.types.includes(ref.type) || !(ref.size > 0 && ref.size <= rules.maxBytes)) {
      return { error: 'The upload was not recognised. Choose the file again.' };
    }
    const head = await store.head(ref.path, 16);
    if (!head || !matchesSignature(head, ref.type)) return { error: 'The file did not finish uploading, or is not what its name says. Choose it again.' };
    return { ...ref, name: safeFileName(ref.name) };
  }
  const file = form.get(field);
  if (!(file instanceof File) || file.size === 0) return null;
  if (!rules.types.includes(file.type) || file.size > rules.maxBytes) return { error: `Allowed: ${rules.label}.` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesSignature(bytes, file.type)) return { error: 'This file is not what its name says.' };
  const path = `${prefix}${randomBytes(12).toString('hex')}-${safeFileName(file.name).replace(/\.[^.]+$/, '').slice(0, 60) || 'file'}.${extensionFor(file.type)}`;
  await store.put(path, bytes, file.type);
  return { path, name: safeFileName(file.name), type: file.type, size: file.size };
}

// Serves a stored file: a redirect to a signed storage URL where possible (fast, supports seeking
// in video), otherwise the bytes themselves.
export async function serveStored(path: string, name: string, type: string, download = false): Promise<Response> {
  const store = await storage();
  const url = await store.downloadUrl(path, name, type);
  if (url) return Response.redirect(url, 302);
  const bytes = await store.get(path);
  if (!bytes) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': type, 'Content-Length': String(bytes.byteLength), 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${name.replace(/["\\\r\n]/g, '')}"`,
    },
  });
}
