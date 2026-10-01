import 'server-only';
// Streamed lesson video (MVP-1 S2) through Bunny Stream. A hub uploads a video once, straight from
// the browser with a resumable (TUS) upload; Bunny encodes it into renditions from 240p to 720p.
// Learners watch in Bunny's adaptive player, which picks the quality their connection can carry,
// and a small 360p MP4 serves data saver and offline downloads.
// Drivers: "bunny" (production), "fake" (tests: a local TUS endpoint and files under .stream/),
// unset or "off" (streaming hidden; hubs keep YouTube or Vimeo links and plain uploads).
import { createHash, createHmac } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from './env';

export type StreamStatus = 'uploading' | 'processing' | 'ready' | 'failed';
export interface StreamInfo { status: StreamStatus; renditions: string[]; seconds: number | null }
export interface UploadTarget { endpoint: string; headers: Record<string, string>; videoId: string }

const driver = () => (process.env.STREAM_DRIVER ?? 'off') as 'off' | 'fake' | 'bunny';
const bunny = () => ({
  library: process.env.BUNNY_STREAM_LIBRARY_ID ?? '',
  key: process.env.BUNNY_STREAM_API_KEY ?? '',
  cdn: (process.env.BUNNY_STREAM_CDN_HOST ?? '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
  embedKey: process.env.BUNNY_STREAM_TOKEN_KEY ?? '',
  cdnKey: process.env.BUNNY_CDN_TOKEN_KEY ?? '',
});

export const streamEnabled = () => driver() === 'fake' || (driver() === 'bunny' && Boolean(process.env.BUNNY_STREAM_LIBRARY_ID && process.env.BUNNY_STREAM_API_KEY && process.env.BUNNY_STREAM_CDN_HOST));
export const streamDriver = driver;
export const MAX_STREAM_BYTES = 4 * 1024 ** 3; // 4 GB

const API = 'https://video.bunnycdn.com';
const HOURS = 3600;

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}/library/${bunny().library}${path}`, {
    ...init,
    headers: { AccessKey: bunny().key, Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) throw new Error(`Bunny Stream ${init.method ?? 'GET'} ${path} failed (${res.status}): ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// ---------------------------------------------------------------- fake driver (tests)

const fakeDir = () => join(process.cwd(), '.stream');
const fakeSign = (videoId: string, expires: number) => createHmac('sha256', process.env.CRON_SECRET ?? 'fake-stream').update(`${videoId}:${expires}`).digest('hex');
export interface FakeUpload { length: number; offset: number; title: string }

export async function fakeState(videoId: string): Promise<FakeUpload | null> {
  if (!/^fake-[0-9a-f]{16}$/.test(videoId)) return null;
  try { return JSON.parse(await readFile(join(fakeDir(), `${videoId}.json`), 'utf8')) as FakeUpload; } catch { return null; }
}
export async function fakeSave(videoId: string, state: FakeUpload) {
  await mkdir(fakeDir(), { recursive: true });
  await writeFile(join(fakeDir(), `${videoId}.json`), JSON.stringify(state));
}
export const fakeFile = (videoId: string) => join(fakeDir(), `${videoId}.bin`);
export function fakeAuthorised(videoId: string, expires: string | null, signature: string | null): boolean {
  const e = Number(expires);
  return Boolean(signature) && Number.isFinite(e) && e * 1000 > Date.now() && signature === fakeSign(videoId, e);
}

// ---------------------------------------------------------------- driver-neutral API

// Creates the video on the provider and returns where the browser uploads it (TUS protocol).
export async function createUpload(title: string): Promise<UploadTarget> {
  const expires = Math.floor(Date.now() / 1000) + 6 * HOURS;
  if (driver() === 'fake') {
    const videoId = `fake-${randomBytes(8).toString('hex')}`;
    return { videoId, endpoint: '/api/stream/fake-tus', headers: { VideoId: videoId, LibraryId: 'fake', AuthorizationExpire: String(expires), AuthorizationSignature: fakeSign(videoId, expires) } };
  }
  const video = await api('/videos', { method: 'POST', body: JSON.stringify({ title: title.slice(0, 200) }) }) as { guid: string };
  const b = bunny();
  const signature = createHash('sha256').update(`${b.library}${b.key}${expires}${video.guid}`).digest('hex');
  return { videoId: video.guid, endpoint: `${API}/tusupload`, headers: { VideoId: video.guid, LibraryId: b.library, AuthorizationExpire: String(expires), AuthorizationSignature: signature } };
}

// Bunny's video status: 0 queued, 1 processing, 2 encoding, 3 finished, 4 resolution finished
// (playable in at least one quality), 5 failed, 6 to 8 upload states.
export async function streamInfo(videoId: string): Promise<StreamInfo | null> {
  if (driver() === 'fake') {
    const s = await fakeState(videoId);
    if (!s) return null;
    return s.offset >= s.length ? { status: 'ready', renditions: ['240p', '360p', '480p', '720p'], seconds: 12 } : { status: 'uploading', renditions: [], seconds: null };
  }
  const v = await api(`/videos/${encodeURIComponent(videoId)}`).catch((e) => { console.error(e); return null; }) as
    { status: number; length: number; availableResolutions: string | null } | null;
  if (!v) return null;
  const renditions = (v.availableResolutions ?? '').split(',').map((r) => r.trim()).filter(Boolean)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const status: StreamStatus = v.status === 5 || v.status === 8 ? 'failed' : v.status === 3 || v.status === 4 ? 'ready' : v.status === 6 ? 'uploading' : 'processing';
  return { status, renditions, seconds: v.length || null };
}

export async function deleteStream(videoId: string): Promise<void> {
  if (driver() === 'fake') return;
  await api(`/videos/${encodeURIComponent(videoId)}`, { method: 'DELETE' }).catch((e) => console.error('stream delete failed', e));
}

// The adaptive player for a ready video, signed for a few hours when the library uses embed
// token authentication. Null in the fake driver, where the plain file plays instead.
export function embedUrl(videoId: string): string | null {
  if (driver() !== 'bunny') return null;
  const b = bunny();
  const params = new URLSearchParams({ autoplay: 'false', preload: 'false', responsive: 'true' });
  if (b.embedKey) {
    const expires = Math.floor(Date.now() / 1000) + 4 * HOURS;
    params.set('token', createHash('sha256').update(`${b.embedKey}${videoId}${expires}`).digest('hex'));
    params.set('expires', String(expires));
  }
  return `https://iframe.mediadelivery.net/embed/${b.library}/${videoId}?${params}`;
}

// The small MP4 (360p, or the smallest rendition) for data saver and offline, signed when the
// CDN uses token authentication. Needs "MP4 fallback" on in the Bunny library.
export function smallFileUrl(videoId: string, renditions: string[]): string | null {
  if (driver() !== 'bunny') return null;
  const b = bunny();
  const res = renditions.includes('360p') ? '360p' : renditions.find((r) => parseInt(r, 10) >= 240) ?? '360p';
  const path = `/${videoId}/play_${res}.mp4`;
  if (!b.cdnKey) return `https://${b.cdn}${path}`;
  const expires = Math.floor(Date.now() / 1000) + 6 * HOURS;
  const token = createHash('sha256').update(`${b.cdnKey}${path}${expires}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `https://${b.cdn}${path}?token=${token}&expires=${expires}`;
}

// A rough size for the small file, for the offline download estimate (360p at about 400 kbps).
export const smallFileBytes = (seconds: number | null) => Math.round((seconds ?? 0) * 50_000);

export async function fakeFileSize(videoId: string): Promise<number> {
  return stat(fakeFile(videoId)).then((s) => s.size).catch(() => 0);
}

export const streamWebhookUrl = () => `${env.appUrl}/api/stream/webhook?secret=${encodeURIComponent(process.env.STREAM_WEBHOOK_SECRET ?? '')}`;
