'use client';
// A file field that uploads as soon as a file is chosen, with progress, straight to storage.
// Sends a small reference with the form (or the file itself where storage cannot take direct uploads).
import { useState } from 'react';
import { Field } from './ui';

interface Uploaded { path: string; name: string; type: string; size: number }
type Prepared = { ok: true; path: string; url: string | null } | { ok: false; error: string };
type State = { kind: 'idle' } | { kind: 'uploading'; name: string; progress: number } | { kind: 'done'; file: Uploaded } | { kind: 'inline'; name: string } | { kind: 'error'; message: string };

const INLINE_LIMIT = 4 * 1024 * 1024;
const size = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

function put(url: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`status ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(file);
  });
}

export function DirectUpload({ id, name, label, hint, accept, maxBytes, prepare, error, onBusy, current }: {
  id: string; name: string; label: string; hint: string; accept: string[]; maxBytes: number;
  prepare: (name: string, type: string, size: number) => Promise<Prepared>; error?: string; onBusy?: (busy: boolean) => void; current?: string | null;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function choose(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) { setState({ kind: 'idle' }); return; }
    if (!accept.includes(file.type)) { input.value = ''; setState({ kind: 'error', message: `This type of file is not allowed. ${hint}` }); return; }
    if (file.size > maxBytes) { input.value = ''; setState({ kind: 'error', message: `This file is ${size(file.size)}. ${hint}` }); return; }
    onBusy?.(true);
    setState({ kind: 'uploading', name: file.name, progress: 0 });
    try {
      const prep = await prepare(file.name, file.type, file.size);
      if (!prep.ok) { input.value = ''; setState({ kind: 'error', message: prep.error }); return; }
      if (prep.url) {
        try {
          await put(prep.url, file, (p) => setState({ kind: 'uploading', name: file.name, progress: p }));
          setState({ kind: 'done', file: { path: prep.path, name: file.name, type: file.type, size: file.size } });
          return;
        } catch { /* fall back to sending it with the form */ }
      }
      if (file.size > INLINE_LIMIT) { input.value = ''; setState({ kind: 'error', message: 'We could not upload this file on your connection. Try again.' }); return; }
      setState({ kind: 'inline', name: file.name });
    } catch {
      setState({ kind: 'inline', name: file.name });
    } finally {
      onBusy?.(false);
    }
  }

  const done = state.kind === 'done' ? state.file : null;
  const message = state.kind === 'error' ? state.message : error;
  return (
    <Field label={label} htmlFor={id} hint={hint} error={message}>
      {current && !done && state.kind !== 'inline' && <p className="mb-2 text-sm text-muted">Current file: <b className="text-ink">{current}</b>. Choose another to replace it.</p>}
      {done && (
        <div className="mb-2 flex items-center gap-3 rounded-[var(--radius-control)] border border-teal/40 bg-teal/5 px-3 py-2.5 text-sm">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-teal text-white" aria-hidden>✓</span>
          <span className="min-w-0 flex-1 truncate font-semibold">{done.name}</span>
          <span className="shrink-0 text-muted">{size(done.size)}</span>
          <input type="hidden" name={`${name}.uploaded`} value={JSON.stringify(done)} />
        </div>
      )}
      {state.kind === 'uploading' && (
        <div className="mb-2 space-y-1.5 rounded-[var(--radius-control)] border border-line bg-white px-3 py-2.5 text-sm" role="status" aria-live="polite">
          <div className="flex justify-between gap-3"><span className="truncate font-semibold">{state.name}</span><span className="text-muted">Uploading {Math.round(state.progress * 100)}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-blue transition-[width]" style={{ width: `${Math.max(4, state.progress * 100)}%` }} /></div>
        </div>
      )}
      <input id={id} type="file" accept={accept.join(',')} name={done ? undefined : name}
        onChange={(e) => { void choose(e.currentTarget); }} aria-invalid={message ? true : undefined}
        className="block w-full rounded-[var(--radius-control)] border border-dashed border-line bg-white p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-canvas file:px-3 file:py-2 file:font-semibold" />
    </Field>
  );
}
