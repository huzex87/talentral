// The upload resource of the fake TUS server: HEAD reports the offset, PATCH appends a chunk.
import { appendFile } from 'node:fs/promises';
import { fakeFile, fakeSave, fakeState, streamDriver } from '@/lib/stream';

export const dynamic = 'force-dynamic';
const TUS = { 'Tus-Resumable': '1.0.0' };

export async function HEAD(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = streamDriver() === 'fake' ? await fakeState(id) : null;
  if (!s) return new Response(null, { status: 404, headers: TUS });
  return new Response(null, { status: 200, headers: { ...TUS, 'Upload-Offset': String(s.offset), 'Upload-Length': String(s.length), 'Cache-Control': 'no-store' } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = streamDriver() === 'fake' ? await fakeState(id) : null;
  if (!s) return new Response(null, { status: 404, headers: TUS });
  if (req.headers.get('content-type') !== 'application/offset+octet-stream') return new Response(null, { status: 415, headers: TUS });
  if (Number(req.headers.get('upload-offset')) !== s.offset) return new Response(null, { status: 409, headers: TUS });
  const chunk = Buffer.from(await req.arrayBuffer());
  if (s.offset + chunk.length > s.length) return new Response(null, { status: 413, headers: TUS });
  await appendFile(fakeFile(id), chunk);
  const next = { ...s, offset: s.offset + chunk.length };
  await fakeSave(id, next);
  return new Response(null, { status: 204, headers: { ...TUS, 'Upload-Offset': String(next.offset) } });
}
