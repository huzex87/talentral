// Creating an invitation and emailing its link. Server-only: never exposed as an action.
import 'server-only';
import { withUser } from '@talentral/db';
import { env } from './env';
import { inviteMail, sendMail } from './mail';
import { newToken } from './tokens';

const INVITE_DAYS = 7;

// Shared by hub teams and the platform console (which invites hub owners).
export async function createInvite(opts: { userId: string; inviterName: string | null; tenantId: string; hubName: string; email: string; role: 'owner' | 'admin' | 'reviewer' | 'facilitator' }) {
  const { token, hash } = newToken();
  await withUser(opts.userId, async (tx) => {
    await tx`delete from public.invites where tenant_id = ${opts.tenantId} and email = ${opts.email} and accepted_at is null`;
    await tx`insert into public.invites (tenant_id, email, role, token_hash, invited_by, expires_at)
             values (${opts.tenantId}, ${opts.email}, ${opts.role}, ${hash}, ${opts.userId}, now() + ${`${INVITE_DAYS} days`}::interval)`;
    await tx`select app.audit(${opts.tenantId}, 'member.invited', 'invite', null, ${tx.json({ email: opts.email, role: opts.role })})`;
  });
  await sendMail(inviteMail(opts.email, opts.hubName, opts.role, `${env.appUrl}/invite/${encodeURIComponent(token)}`, opts.inviterName));
}

