// Bunny Stream calls this when a video's encoding moves on (set the webhook URL in the library to
// /api/stream/webhook?secret=<STREAM_WEBHOOK_SECRET>). The payload is only a hint: the status is
// always read back from Bunny with our API key before the lesson is updated.
import { system } from '@talentral/db';
import { streamInfo } from '@/lib/stream';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = process.env.STREAM_WEBHOOK_SECRET;
  if (!secret || new URL(req.url).searchParams.get('secret') !== secret) return new Response('Unauthorised', { status: 401 });
  const body = await req.json().catch(() => null) as { VideoGuid?: string } | null;
  const videoId = body?.VideoGuid;
  if (!videoId || !/^[\w-]{8,100}$/.test(videoId)) return new Response('Bad request', { status: 400 });
  const info = await streamInfo(videoId);
  if (!info) return Response.json({ ok: true, updated: 0 });
  const rows = await system()`update public.lessons set stream_status = ${info.status}, stream_renditions = ${info.renditions}, stream_seconds = ${info.seconds},
    stream_updated_at = now() where stream_id = ${videoId} returning id`;
  return Response.json({ ok: true, updated: rows.length });
}
