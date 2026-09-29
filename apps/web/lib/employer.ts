import 'server-only';
// Employer accounts: people who belong to an employer organisation. An organisation is pending
// until a Talentral talent officer verifies it; only verified employers can post jobs or search.
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { withUser, type User } from '@talentral/db';
import { currentUser } from './auth';

export interface EmployerAccount {
  id: string; name: string; sector: string | null; website: string | null; state: string | null; size: string | null;
  contact_name: string | null; contact_email: string | null; contact_phone: string | null;
  status: 'pending' | 'verified' | 'suspended'; verified_at: Date | null; created_at: Date;
}

export const myEmployers = cache(async (userId: string) =>
  withUser(userId, (tx) => tx<EmployerAccount[]>`select * from app.my_employers()`));

export async function requireEmployer(): Promise<{ user: User; employer: EmployerAccount }> {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  const [employer] = await myEmployers(user.id);
  if (!employer) notFound();
  return { user, employer };
}

export async function requireVerifiedEmployer() {
  const access = await requireEmployer();
  if (access.employer.status !== 'verified') throw new Error('Your organisation is not verified yet.');
  return access;
}

export function adminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean);
}
