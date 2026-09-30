'use server';
// Streamed video for a lesson: start an upload, confirm it finished, check encoding, remove.
import { withUser } from '@talentral/db';
import { requireHubRole } from '@/lib/auth';
import { MAX_STREAM_BYTES, createUpload, deleteStream, streamEnabled, streamInfo, type StreamStatus, type UploadTarget } from '@/lib/stream';

const UUID = /^[0-9a-f-]{36}$/;
export interface StreamState { status: StreamStatus | null; renditions: string[]; seconds: number | null }
type Lesson = { id: string; title: string; kind: string; stream_id: string | null };

async function lesson(slug: string, lessonId: string) {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  if (!UUID.test(lessonId)) throw new Error('Unknown lesson');
  const [l] = await withUser(user.id, (tx) => tx<Lesson[]>`select id, title, kind, stream_id from public.lessons where id = ${lessonId} and tenant_id = ${hub.id}`);
  if (!l || l.kind !== 'video') throw new Error('Unknown lesson');
  return { user, hub, l };
}

async function save(userId: string, lessonId: string, s: { id?: string | null; status: StreamStatus | null; renditions?: string[]; seconds?: number | null }) {
  await withUser(userId, (tx) => tx`update public.lessons set
    ${s.id !== undefined ? tx`stream_id = ${s.id},` : tx``} stream_status = ${s.status}, stream_renditions = ${s.renditions ?? []}, stream_seconds = ${s.seconds ?? null}, stream_updated_at = now()
    where id = ${lessonId}`);
}

export async function startStreamUpload(slug: string, lessonId: string, name: string, type: string, size: number): Promise<{ ok: true; target: UploadTarget } | { ok: false; error: string }> {
  if (!streamEnabled()) return { ok: false, error: 'Video streaming is not set up yet.' };
  if (!/^video\//.test(type)) return { ok: false, error: 'Choose a video file (MP4, MOV, WebM or similar).' };
  if (!(size > 0 && size <= MAX_STREAM_BYTES)) return { ok: false, error: 'Choose a video up to 4 GB.' };
  const { user, l } = await lesson(slug, lessonId);
  const target = await createUpload(`${l.title} (${name})`).catch((e) => { console.error(e); return null; });
  if (!target) return { ok: false, error: 'We could not start the upload. Please try again.' };
  // A replaced video is removed from the provider once the new one is in place.
  const old = l.stream_id;
  await save(user.id, lessonId, { id: target.videoId, status: 'uploading' });
  if (old) await deleteStream(old);
  return { ok: true, target };
}

// After the browser finishes uploading, or while the video is encoding: reads the provider's state.
export async function checkStream(slug: string, lessonId: string, justUploaded = false): Promise<StreamState> {
  const { user, l } = await lesson(slug, lessonId);
  if (!l.stream_id) return { status: null, renditions: [], seconds: null };
  const info = await streamInfo(l.stream_id);
  const state: StreamState = info
    ? { status: justUploaded && info.status === 'uploading' ? 'processing' : info.status, renditions: info.renditions, seconds: info.seconds }
    : { status: justUploaded ? 'processing' : 'failed', renditions: [], seconds: null };
  await save(user.id, lessonId, state);
  return state;
}

export async function removeStream(slug: string, lessonId: string): Promise<StreamState> {
  const { user, l } = await lesson(slug, lessonId);
  if (l.stream_id) await deleteStream(l.stream_id);
  await save(user.id, lessonId, { id: null, status: null });
  return { status: null, renditions: [], seconds: null };
}
