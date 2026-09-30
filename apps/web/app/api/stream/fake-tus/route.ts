// A small TUS server standing in for Bunny Stream when STREAM_DRIVER=fake (the e2e suite), so the
// browser's real resumable-upload code runs end to end. Creating an upload checks the same kind of
// signed headers Bunny checks.
import { fakeAuthorised, fakeFile, fakeSave, streamDriver } from '@/lib/stream';
import { writeFile } from 'node:fs/promises';

export const dynamic = 'force-dynamic';
const TUS = { 'Tus-Resumable': '1.0.0' };

export async function POST(req: Request) {
  if (streamDriver() !== 'fake') return new Response('Not found', { status: 404 });
  const h = req.headers;
  const videoId = h.get('videoid') ?? '';
  const length = Number(h.get('upload-length'));
  if (!fakeAuthorised(videoId, h.get('authorizationexpire'), h.get('authorizationsignature'))) return new Response('Unauthorised', { status: 401, headers: TUS });
  if (!Number.isInteger(length) || length <= 0) return new Response('Upload-Length required', { status: 400, headers: TUS });
  const meta = Object.fromEntries((h.get('upload-metadata') ?? '').split(',').filter(Boolean).map((p) => { const [k, v] = p.trim().split(' '); return [k, v ? Buffer.from(v, 'base64').toString() : '']; }));
  await fakeSave(videoId, { length, offset: 0, title: meta.title ?? '' });
  await writeFile(fakeFile(videoId), Buffer.alloc(0));
  return new Response(null, { status: 201, headers: { ...TUS, Location: `/api/stream/fake-tus/${videoId}` } });
}
