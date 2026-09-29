// File storage behind one interface: local disk for development, any S3-compatible bucket
// (Supabase Storage's S3 endpoint in production). Files are private; the app serves them.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { env } from './env';

interface Storage {
  put(path: string, body: Uint8Array, contentType: string): Promise<void>;
  get(path: string): Promise<Uint8Array | null>;
  remove(path: string): Promise<void>;
}

const LOCAL_ROOT = join(process.cwd(), '.uploads');

function localPath(path: string): string {
  const full = normalize(join(LOCAL_ROOT, path));
  if (!full.startsWith(LOCAL_ROOT)) throw new Error('Invalid storage path');
  return full;
}

const local: Storage = {
  async put(path, body) {
    const full = localPath(path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
  },
  async get(path) {
    try { return new Uint8Array(await readFile(localPath(path))); } catch { return null; }
  },
  async remove(path) { await rm(localPath(path), { force: true }); },
};

let s3Instance: Storage | null = null;
async function s3(): Promise<Storage> {
  if (s3Instance) return s3Instance;
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'auto',
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '' },
  });
  const Bucket = process.env.S3_BUCKET ?? '';
  s3Instance = {
    async put(path, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: path, Body: body, ContentType: contentType }));
    },
    async get(path) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket, Key: path }));
        return res.Body ? await res.Body.transformToByteArray() : null;
      } catch { return null; }
    },
    async remove(path) { await client.send(new DeleteObjectCommand({ Bucket, Key: path })); },
  };
  return s3Instance;
}

export async function storage(): Promise<Storage> {
  return env.storageDriver === 's3' ? s3() : local;
}
