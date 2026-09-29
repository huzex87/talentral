// Application reference numbers such as KIR-26-7K4Q2: a hub prefix, the year and five
// Crockford base-32 characters (no I, L, O or U, so they are easy to read over the phone).
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function referencePrefix(hubSlug: string): string {
  const letters = hubSlug.replace(/[^a-z]/g, '').toUpperCase();
  return (letters.slice(0, 3) || 'TLR').padEnd(3, 'X');
}

export function newReference(prefix: string, now = new Date(), random: (n: number) => Uint8Array = randomBytes): string {
  const bytes = random(5);
  let code = '';
  for (const b of bytes) code += ALPHABET[b % 32];
  return `${prefix}-${String(now.getUTCFullYear()).slice(2)}-${code}`;
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export const REFERENCE_PATTERN = /^[A-Z]{3}-\d{2}-[0-9A-HJKMNP-TV-Z]{5}$/;
