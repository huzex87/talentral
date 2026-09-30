// A lesson's file (PDF, audio or video) for an enrolled learner, once the lesson is open. For a
// streamed video this is the small 360p version, used for data saver and offline study.
import { readFile } from 'node:fs/promises';
import { withUser } from '@talentral/db';
import { currentUser } from '@/lib/auth';
import { storage } from '@/lib/storage';
import { fakeFile, smallFileUrl, streamDriver } from '@/lib/stream';
import { serveStored } from '@/lib/uploads';

export async function GET(req: Request, { params }: { params: Promise<{ cohort: string; lesson: string }> }) {
  const { cohort, lesson } = await params;
  const user = await currentUser();
  if (!user || !/^[0-9a-f-]{36}$/.test(cohort) || !/^[0-9a-f-]{36}$/.test(lesson)) return new Response('Not found', { status: 404 });
  const offline = new URL(req.url).searchParams.has('offline');
  const { stream, file } = await withUser(user.id, async (tx) => {
    const [stream] = await tx<{ stream_id: string; stream_status: string; stream_renditions: string[] }[]>`select * from app.lesson_stream(${cohort}, ${lesson})`;
    const [file] = await tx<{ file_path: string; file_name: string; file_type: string }[]>`select * from app.lesson_file(${cohort}, ${lesson})`;
    return { stream, file };
  });

  if (stream?.stream_status === 'ready') {
    if (streamDriver() === 'fake') {
      if (offline) return Response.json({ url: null, type: 'video/mp4' }, { headers: { 'Cache-Control': 'no-store' } });
      const bytes = await readFile(fakeFile(stream.stream_id)).catch(() => null);
      return bytes ? new Response(bytes, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length), 'Cache-Control': 'private, no-store' } }) : new Response('Not found', { status: 404 });
    }
    const url = smallFileUrl(stream.stream_id, stream.stream_renditions);
    if (url) return offline ? Response.json({ url, type: 'video/mp4' }, { headers: { 'Cache-Control': 'no-store' } }) : Response.redirect(url, 302);
  }

  if (!file) return new Response('Not found', { status: 404 });
  // For saving offline the phone asks where to fetch the file from: a short-lived storage link,
  // so large videos come straight from storage, or null to fetch it from this address.
  if (offline) {
    const url = await (await storage()).downloadUrl(file.file_path, file.file_name, file.file_type);
    return Response.json({ url, type: file.file_type }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return serveStored(file.file_path, file.file_name, file.file_type, new URL(req.url).searchParams.has('download'));
}
