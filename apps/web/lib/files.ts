// Checks uploaded bytes against their declared type, so a renamed executable cannot pass as a PDF.
const SIGNATURES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  // Office documents and ZIP files are all zip archives.
  'application/zip': [[0x50, 0x4b, 0x03, 0x04]],
  'application/x-zip-compressed': [[0x50, 0x4b, 0x03, 0x04]],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4b, 0x03, 0x04]],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [[0x50, 0x4b, 0x03, 0x04]],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [[0x50, 0x4b, 0x03, 0x04]],
  'audio/mpeg': [[0x49, 0x44, 0x33], [0xff, 0xfb], [0xff, 0xf3], [0xff, 0xf2]],
  'audio/ogg': [[0x4f, 0x67, 0x67, 0x53]],
  'video/webm': [[0x1a, 0x45, 0xdf, 0xa3]],
};

// MP4 and M4A carry "ftyp" at byte 4 rather than at the start.
const FTYP = ['video/mp4', 'audio/mp4', 'audio/x-m4a'];

export function matchesSignature(bytes: Uint8Array, type: string): boolean {
  if (FTYP.includes(type)) return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
  const sigs = SIGNATURES[type];
  if (!sigs) return false;
  return sigs.some((sig) => sig.every((b, i) => bytes[i] === b));
}

export function extensionFor(type: string): string {
  return ({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/zip': 'zip', 'application/x-zip-compressed': 'zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/ogg': 'ogg',
    'video/mp4': 'mp4', 'video/webm': 'webm' } as Record<string, string>)[type] ?? 'bin';
}

export function safeFileName(name: string): string {
  return name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(-80) || 'file';
}

// Serves a stored image with long caching; callers put a version in the URL when it can change.
export function imageResponse(path: string, bytes: Uint8Array): Response {
  const type = path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return new Response(Buffer.from(bytes), { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
}
