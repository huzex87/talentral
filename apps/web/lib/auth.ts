// Email sign-in links, phone sign-in codes, sessions and role checks. Tokens, codes and session
// secrets are stored hashed.
import 'server-only';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { cache } from 'react';
import { system, withUser, type Role, type Tenant, type User } from '@talentral/db';
import { env } from './env';
import { hashToken, newToken } from './tokens';
import { sendMail, signInMail } from './mail';
import { sendSmsBatch } from './sms';
import { PHONE_CODE_LENGTH, PHONE_CODE_MINUTES, PHONE_CODE_TRIES, phoneCodeText } from '@talentral/domain';

const COOKIE = 'tl_session';
const SESSION_DAYS = 30;
const LINK_MINUTES = 15;
// Five links per email per hour; the end-to-end suite signs the same people in many times.
const LINKS_PER_HOUR = Number(process.env.SIGN_IN_LINKS_PER_HOUR) || 5;

export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [user] = await system()<User[]>`
    select u.id, u.email, u.full_name, u.is_platform_admin, u.language
    from public.sessions s join public.users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)} and s.expires_at > now()`;
  return user ?? null;
});

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  return user;
}

export async function requirePlatformAdmin(): Promise<User> {
  const user = await requireUser();
  if (!user.is_platform_admin) notFound();
  return user;
}

export interface HubAccess { user: User; hub: Tenant; role: Role | 'platform' }

// Loads a hub for its dashboard, with the caller's role. Platform admins can open any hub.
export const hubAccess = cache(async (slug: string): Promise<HubAccess> => {
  const user = await requireUser();
  const row = await withUser(user.id, async (tx) => {
    const [hub] = await tx<Tenant[]>`select * from public.tenants where slug = ${slug}`;
    if (!hub) return null;
    const [m] = await tx<{ role: Role }[]>`select role from public.memberships where tenant_id = ${hub.id} and user_id = ${user.id}`;
    return { hub, role: m?.role ?? null };
  });
  if (!row) notFound();
  const role = row.role ?? (user.is_platform_admin ? 'platform' : null);
  if (!role) notFound();
  return { user, hub: row.hub, role };
});

export async function requireHubRole(slug: string, roles: Role[]): Promise<HubAccess> {
  const access = await hubAccess(slug);
  if (access.role !== 'platform' && !roles.includes(access.role)) {
    throw new Error('You do not have permission to do that.');
  }
  return access;
}

export function canManage(role: HubAccess['role']): boolean {
  return role === 'owner' || role === 'admin' || role === 'platform';
}

// Sends a sign-in link if the email belongs to a user. The response never reveals whether it does.
export async function requestSignIn(emailInput: string): Promise<void> {
  const email = emailInput.trim().toLowerCase();
  const sql = system();
  let [user] = await sql<{ id: string }[]>`select id from public.users where email = ${email}`;
  // Learners get an account the first time they ask: anyone enrolled in a cohort can sign in with
  // the email they applied with, to see their record and manage their Passport.
  if (!user) {
    [user] = await sql<{ id: string }[]>`
      insert into public.users (email, full_name)
      select ${email}, a.full_name from public.applications a join public.enrolments e on e.application_id = a.id
      where a.email = ${email} order by e.enrolled_at desc limit 1
      on conflict (email) do nothing returning id`;
  }
  if (!user) return;
  const [recent] = await sql<{ count: number }[]>`
    select count(*)::int as count from public.sign_in_tokens where email = ${email} and created_at > now() - interval '1 hour'`;
  if ((recent?.count ?? 0) >= LINKS_PER_HOUR) return;
  const { token, hash } = newToken();
  await sql`insert into public.sign_in_tokens (email, token_hash, expires_at)
            values (${email}, ${hash}, now() + ${`${LINK_MINUTES} minutes`}::interval)`;
  await sendMail(signInMail(email, `${env.appUrl}/auth/verify?token=${encodeURIComponent(token)}`));
}

// Consumes a sign-in link and starts a session. Returns false if the link is invalid or used.
export async function completeSignIn(token: string): Promise<boolean> {
  const sql = system();
  const [row] = await sql<{ email: string }[]>`
    update public.sign_in_tokens set used_at = now()
    where token_hash = ${hashToken(token)} and used_at is null and expires_at > now()
    returning email`;
  if (!row) return false;
  const [user] = await sql<{ id: string }[]>`update public.users set last_sign_in_at = now() where email = ${row.email} returning id`;
  if (!user) return false;
  await startSession(user.id);
  return true;
}

// ---------------------------------------------------------------- phone sign-in

// Finds the learner a phone number belongs to: the account already using it, or else the one
// person enrolled with that number on their application. A number on applications from two
// different people is never linked, so a typo cannot open someone else's account.
async function learnerForPhone(phone: string): Promise<{ id: string; language: 'en' | 'ha' } | null> {
  const sql = system();
  const [known] = await sql<{ id: string; language: 'en' | 'ha' }[]>`select id, language from public.users where phone = ${phone}`;
  if (known) return known;
  const national = phone.slice(3);
  const matches = await sql<{ email: string; full_name: string }[]>`
    select distinct on (lower(a.email)) lower(a.email) as email, a.full_name
    from public.applications a join public.enrolments e on e.application_id = a.id
    where right(regexp_replace(a.phone, '[^0-9]', '', 'g'), 10) = ${national} and e.status <> 'dropped'
    order by lower(a.email), e.enrolled_at desc`;
  if (matches.length !== 1) return null;
  const { email, full_name } = matches[0]!;
  await sql`insert into public.users (email, full_name) values (${email}, ${full_name}) on conflict (email) do nothing`;
  const [user] = await sql<{ id: string; language: 'en' | 'ha'; phone: string | null }[]>`select id, language, phone from public.users where email = ${email}`;
  // Someone who already signs in with a different number keeps it.
  if (!user || (user.phone && user.phone !== phone)) return null;
  return user;
}

// Texts a six-digit code to a learner's phone. Like email links, the reply never says whether the
// number belongs to anyone. A new code replaces any earlier one.
export async function requestPhoneCode(phone: string): Promise<void> {
  const user = await learnerForPhone(phone);
  if (!user) return;
  const sql = system();
  const [recent] = await sql<{ count: number }[]>`
    select count(*)::int as count from public.phone_codes where phone = ${phone} and created_at > now() - interval '1 hour'`;
  if ((recent?.count ?? 0) >= LINKS_PER_HOUR) return;
  const code = String(randomInt(0, 10 ** PHONE_CODE_LENGTH)).padStart(PHONE_CODE_LENGTH, '0');
  await sql.begin(async (tx) => {
    await tx`update public.phone_codes set used_at = now() where phone = ${phone} and used_at is null`;
    await tx`insert into public.phone_codes (phone, user_id, code_hash, expires_at)
             values (${phone}, ${user.id}, ${hashToken(`${phone}:${code}`)}, now() + ${`${PHONE_CODE_MINUTES} minutes`}::interval)`;
  });
  await sendSmsBatch([{ to: phone, text: phoneCodeText(code, user.language) }]);
}

export type PhoneSignIn = 'ok' | 'wrong' | 'expired' | 'locked';

// Checks a code and starts a session. Five wrong tries use the code up.
export async function completePhoneSignIn(phone: string, code: string): Promise<PhoneSignIn> {
  const sql = system();
  const [row] = await sql<{ id: string; user_id: string; code_hash: string; attempts: number; expired: boolean }[]>`
    select id, user_id, code_hash, attempts, expires_at <= now() as expired from public.phone_codes
    where phone = ${phone} and used_at is null order by created_at desc limit 1`;
  if (!row || row.expired) return 'expired';
  if (row.attempts >= PHONE_CODE_TRIES) return 'locked';
  const given = Buffer.from(hashToken(`${phone}:${code}`));
  if (!timingSafeEqual(given, Buffer.from(row.code_hash))) {
    const [r] = await sql<{ attempts: number }[]>`update public.phone_codes set attempts = attempts + 1 where id = ${row.id} returning attempts`;
    return (r?.attempts ?? PHONE_CODE_TRIES) >= PHONE_CODE_TRIES ? 'locked' : 'wrong';
  }
  const [used] = await sql`update public.phone_codes set used_at = now() where id = ${row.id} and used_at is null returning id`;
  if (!used) return 'expired';
  await sql`update public.users set last_sign_in_at = now(),
              phone = coalesce(phone, case when not exists (select 1 from public.users o where o.phone = ${phone}) then ${phone} end)
            where id = ${row.user_id}`;
  await startSession(row.user_id);
  return 'ok';
}

export async function startSession(userId: string): Promise<void> {
  const { token, hash } = newToken();
  await system()`insert into public.sessions (user_id, token_hash, expires_at)
                 values (${userId}, ${hash}, now() + ${`${SESSION_DAYS} days`}::interval)`;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: env.production, path: '/', maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await system()`delete from public.sessions where token_hash = ${hashToken(token)}`;
  jar.delete(COOKIE);
}
