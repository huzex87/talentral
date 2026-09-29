// Email sign-in links, sessions and role checks. Tokens and session secrets are stored hashed.
import 'server-only';
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { cache } from 'react';
import { system, withUser, type Role, type Tenant, type User } from '@talentral/db';
import { env } from './env';
import { hashToken, newToken } from './tokens';
import { sendMail, signInMail } from './mail';

const COOKIE = 'tl_session';
const SESSION_DAYS = 30;
const LINK_MINUTES = 15;
const LINKS_PER_HOUR = 5;

export const currentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [user] = await system()<User[]>`
    select u.id, u.email, u.full_name, u.is_platform_admin
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
