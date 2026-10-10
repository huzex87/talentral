'use server';
import { cookies } from 'next/headers';
import { withUser } from '@talentral/db';
import { hubAccess } from '@/lib/auth';
import { seenCookie } from '@/lib/staff-inbox';

// Opening the bell marks everything up to now as seen, on this browser.
export async function markInboxSeen(slug: string): Promise<void> {
  const { hub } = await hubAccess(slug);
  (await cookies()).set(seenCookie(hub.id), String(Date.now()), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 180, path: '/' });
}

// The signed-in team member's own weekly summary email, on or off.
export async function setWeeklyDigest(slug: string, on: boolean): Promise<{ ok: boolean; on: boolean }> {
  const { user, hub, role } = await hubAccess(slug);
  if (role === 'platform') return { ok: false, on: false };
  await withUser(user.id, (tx) => tx`select app.set_weekly_digest(${hub.id}, ${on})`);
  return { ok: true, on };
}
