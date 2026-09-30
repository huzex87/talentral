// A small TUS 1.0 client for the browser: resumable uploads that survive a dropped connection.
// Creates the upload, then sends 5 MB chunks; after a failure it asks the server how much arrived
// and carries on from there, up to six tries per chunk with growing waits.
const CHUNK = 5 * 1024 * 1024;
const WAITS = [0, 1000, 3000, 5000, 10000, 20000];

export interface TusTarget { endpoint: string; headers: Record<string, string> }

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function tusUpload(file: File, target: TusTarget, onProgress: (sent: number, total: number) => void, signal?: AbortSignal): Promise<void> {
  const create = await fetch(target.endpoint, {
    method: 'POST', signal,
    headers: { ...target.headers, 'Tus-Resumable': '1.0.0', 'Upload-Length': String(file.size), 'Upload-Metadata': `filetype ${b64(file.type || 'video/mp4')},title ${b64(file.name)}` },
  });
  const location = create.headers.get('location');
  if (create.status !== 201 || !location) throw new Error(`The upload could not start (${create.status}).`);
  const url = new URL(location, new URL(target.endpoint, window.location.href)).href;

  let offset = 0;
  onProgress(0, file.size);
  while (offset < file.size) {
    let sent = false;
    for (let attempt = 0; attempt < WAITS.length && !sent; attempt += 1) {
      if (WAITS[attempt]) {
        await sleep(WAITS[attempt]!);
        // Ask where the server got to before sending again.
        const head = await fetch(url, { method: 'HEAD', signal, headers: { 'Tus-Resumable': '1.0.0' } }).catch(() => null);
        const known = Number(head?.headers.get('upload-offset'));
        if (head?.ok && Number.isFinite(known)) offset = known;
        if (offset >= file.size) { sent = true; break; }
      }
      try {
        const res = await fetch(url, {
          method: 'PATCH', signal,
          headers: { 'Tus-Resumable': '1.0.0', 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream' },
          body: file.slice(offset, Math.min(offset + CHUNK, file.size)),
        });
        const next = Number(res.headers.get('upload-offset'));
        if (res.ok && Number.isFinite(next) && next > offset) { offset = next; sent = true; }
      } catch (e) {
        if (signal?.aborted) throw e;
      }
    }
    if (!sent) throw new Error('The connection kept dropping. Try again when it is steadier: the upload continues where it stopped.');
    onProgress(offset, file.size);
  }
}
