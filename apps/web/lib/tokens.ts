import { createHash, randomBytes } from 'node:crypto';

// Random tokens are sent to users; only their SHA-256 hash is stored.
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
