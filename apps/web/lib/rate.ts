import 'server-only';
// Per-address limits for anonymous actions (sign-in requests, applications, enquiries, check-ins),
// on top of the per-person limits each action already has. Counted in the database
// (app.take_rate), so they hold across server instances. RATE_LIMIT_SCALE multiplies every limit
// (the test suite, which sends everything from one address, raises it).
import { headers } from 'next/headers';
import { withUser } from '@talentral/db';

const SCALE = Math.max(1, Number(process.env.RATE_LIMIT_SCALE) || 1);

export const LIMITS = {
  signIn: [30, 3600], // sign-in links and phone codes requested from one address an hour
  apply: [20, 3600], // applications submitted from one address an hour
  enquiry: [5, 3600], // hub enquiries and employer registrations an hour
  checkIn: [120, 3600], // class check-ins from one address (a hub's shared Wi-Fi) an hour
  verifyCode: [60, 3600], // two-step and phone code attempts from one address an hour
  replyLink: [60, 3600], // one-tap answers to role invitations from one address an hour
} as const satisfies Record<string, readonly [number, number]>;

export async function clientAddress(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}

// True when this address may go ahead; counts the attempt either way.
export async function allowFromAddress(kind: keyof typeof LIMITS): Promise<boolean> {
  const [limit, window] = LIMITS[kind];
  const ip = await clientAddress();
  const [r] = await withUser(null, (tx) => tx<{ ok: boolean }[]>`select app.take_rate(${`${kind}:${ip}`}, ${limit * SCALE}, ${window}) as ok`);
  return r?.ok ?? true;
}

export const TOO_MANY = { en: 'Too many attempts from this connection. Please wait a while and try again.', ha: 'An yi ƙoƙari da yawa daga wannan haɗin. Jira kaɗan sannan ka sake gwadawa.' };
