import 'server-only';
// The public credential API (MVP-2 month 11): what a Talentral certificate says and whether it
// still stands, as JSON for employers' and funders' systems. When CERTIFICATE_SIGNING_KEY holds an
// Ed25519 private key (PKCS#8, PEM or base64 DER), each answer is signed so it can be checked
// offline against the public key published at /api/v1/public/keys.
import { createHash, createPrivateKey, createPublicKey, sign, type KeyObject } from 'node:crypto';
import { withUser } from '@talentral/db';
import { CERTIFICATE_PATTERN, type PartnerSnapshot } from '@talentral/domain';
import { env } from './env';

type Row = { serial: string; learner_name: string; programme_title: string; cohort_name: string; hub_name: string; hub_slug: string; track: string | null;
  attendance: string | null; score: string | null; completed_on: string; partners: PartnerSnapshot[]; issued_at: Date; revoked_at: Date | null; revoked_reason: string | null };

export interface Credential {
  object: 'credential'; serial: string; status: 'valid' | 'revoked';
  holder: { name: string };
  achievement: { programme: string; cohort: string; track: string | null; completed_on: string; attendance_percent: number | null; score_percent: number | null };
  issuer: { name: string; slug: string; url: string };
  partners: { name: string; role: string }[];
  issued_at: string; revoked_at: string | null; revoked_reason: string | null;
  verify_url: string;
}

export async function findCredential(raw: string): Promise<Credential | null> {
  const serial = raw.trim().toUpperCase();
  if (!CERTIFICATE_PATTERN.test(serial)) return null;
  const [c] = await withUser(null, (tx) => tx<Row[]>`
    select serial, learner_name, programme_title, cohort_name, hub_name, hub_slug, track, attendance::text, score::text, completed_on::text, partners, issued_at, revoked_at, revoked_reason
    from app.verify_certificate(${serial})`);
  if (!c) return null;
  const num = (v: string | null) => (v === null ? null : Number(v));
  return {
    object: 'credential', serial: c.serial, status: c.revoked_at ? 'revoked' : 'valid',
    holder: { name: c.learner_name },
    achievement: { programme: c.programme_title, cohort: c.cohort_name, track: c.track, completed_on: c.completed_on, attendance_percent: num(c.attendance), score_percent: num(c.score) },
    issuer: { name: c.hub_name, slug: c.hub_slug, url: `${env.appUrl}/${c.hub_slug}` },
    partners: (c.partners ?? []).map((p) => ({ name: p.name, role: p.role })),
    issued_at: new Date(c.issued_at).toISOString(), revoked_at: c.revoked_at ? new Date(c.revoked_at).toISOString() : null, revoked_reason: c.revoked_reason,
    verify_url: `${env.appUrl}/verify/${c.serial}`,
  };
}

// JSON with object keys sorted at every level, so a signature can be checked byte for byte.
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

let cached: { key: KeyObject; pub: KeyObject; kid: string } | null | undefined;
function signingKey() {
  if (cached !== undefined) return cached;
  const raw = process.env.CERTIFICATE_SIGNING_KEY?.trim();
  if (!raw) return (cached = null);
  try {
    const key = raw.includes('BEGIN') ? createPrivateKey(raw) : createPrivateKey({ key: Buffer.from(raw, 'base64'), format: 'der', type: 'pkcs8' });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('not an Ed25519 key');
    const pub = createPublicKey(key);
    const kid = createHash('sha256').update(pub.export({ format: 'der', type: 'spki' })).digest('hex').slice(0, 16);
    return (cached = { key, pub, kid });
  } catch (e) {
    console.error('CERTIFICATE_SIGNING_KEY is not a usable Ed25519 private key', e instanceof Error ? e.message : e);
    return (cached = null);
  }
}

export function signCredential(c: Credential): { alg: 'Ed25519'; kid: string; value: string } | null {
  const k = signingKey();
  if (!k) return null;
  return { alg: 'Ed25519', kid: k.kid, value: sign(null, Buffer.from(canonicalJson(c)), k.key).toString('base64url') };
}

export function publicKeys(): { kty: 'OKP'; crv: 'Ed25519'; x: string; kid: string; use: 'sig'; alg: 'EdDSA' }[] {
  const k = signingKey();
  if (!k) return [];
  const jwk = k.pub.export({ format: 'jwk' }) as { x: string };
  return [{ kty: 'OKP', crv: 'Ed25519', x: jwk.x, kid: k.kid, use: 'sig', alg: 'EdDSA' }];
}

// The caller's address, for rate limits. Vercel and most proxies put it first in x-forwarded-for.
export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

export async function withinRate(bucket: string, limit: number, windowSeconds = 60): Promise<boolean> {
  const [r] = await withUser(null, (tx) => tx<{ ok: boolean }[]>`select app.take_rate(${bucket}, ${limit}, ${windowSeconds}) as ok`);
  return r?.ok ?? false;
}

export const API_HEADERS = {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
  'X-Robots-Tag': 'noindex', 'Content-Type': 'application/json; charset=utf-8',
} as const;
