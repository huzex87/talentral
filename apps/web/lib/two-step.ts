// Turning two-step sign-in on and off, and recovery codes. Signing in with it is in lib/auth.ts.
import 'server-only';
import QRCode from 'qrcode';
import { system } from '@talentral/db';
import { hashRecovery, matchStep, newRecoveryCodes, newSecret, normaliseRecovery, otpauthUrl } from './totp';

export interface TwoStepStatus { enabled: boolean; enabledAt: Date | null; recoveryLeft: number; requiredBy: string[] }

export async function twoStepStatus(userId: string): Promise<TwoStepStatus> {
  const sql = system();
  const [t] = await sql<{ enabled_at: Date | null }[]>`select enabled_at from public.user_totp where user_id = ${userId}`;
  const [r] = await sql<{ n: number }[]>`select count(*)::int as n from public.recovery_codes where user_id = ${userId} and used_at is null`;
  const hubs = await sql<{ name: string }[]>`
    select t.name from public.memberships m join public.tenants t on t.id = m.tenant_id where m.user_id = ${userId} and t.require_two_step order by t.name`;
  return { enabled: Boolean(t?.enabled_at), enabledAt: t?.enabled_at ?? null, recoveryLeft: r?.n ?? 0, requiredBy: hubs.map((h) => h.name) };
}

// A new secret to scan. Replaces any unfinished setup; never touches a working one.
export async function beginSetup(userId: string, email: string): Promise<{ secret: string; qr: string }> {
  const secret = newSecret();
  await system()`insert into public.user_totp (user_id, secret) values (${userId}, ${secret})
                 on conflict (user_id) do update set secret = excluded.secret, last_step = 0, created_at = now()
                 where public.user_totp.enabled_at is null`;
  const [row] = await system()<{ secret: string; enabled_at: Date | null }[]>`select secret, enabled_at from public.user_totp where user_id = ${userId}`;
  if (row?.enabled_at) throw new Error('Two-step sign-in is already on.');
  const qr = await QRCode.toString(otpauthUrl(row!.secret, email), { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#101733', light: '#FFFFFF' } });
  return { secret: row!.secret, qr };
}

async function audit(userId: string, action: string) {
  await system()`insert into public.audit_log (actor_id, action, target_type, target_id) values (${userId}, ${action}, 'user', ${userId})`;
}

async function freshRecoveryCodes(userId: string): Promise<string[]> {
  const codes = newRecoveryCodes();
  await system().begin(async (tx) => {
    await tx`delete from public.recovery_codes where user_id = ${userId}`;
    for (const c of codes) await tx`insert into public.recovery_codes (user_id, code_hash) values (${userId}, ${hashRecovery(c)})`;
  });
  return codes;
}

// Proves the app is set up by checking one code, then switches two-step sign-in on.
export async function confirmSetup(userId: string, code: string): Promise<string[] | null> {
  const sql = system();
  const [t] = await sql<{ secret: string }[]>`select secret from public.user_totp where user_id = ${userId} and enabled_at is null`;
  if (!t) return null;
  const step = matchStep(t.secret, code.replace(/\s/g, ''));
  if (step === null) return null;
  const on = await sql`update public.user_totp set enabled_at = now(), last_step = ${step} where user_id = ${userId} and enabled_at is null returning user_id`;
  if (!on.length) return null;
  await audit(userId, 'account.two_step_enabled');
  return freshRecoveryCodes(userId);
}

// A current authenticator code or an unused recovery code, for changes that need proof.
export async function checkCode(userId: string, input: string): Promise<boolean> {
  const sql = system();
  const [t] = await sql<{ secret: string; last_step: string }[]>`select secret, last_step from public.user_totp where user_id = ${userId} and enabled_at is not null`;
  if (!t) return false;
  const step = matchStep(t.secret, input.replace(/\s/g, ''), Date.now(), Number(t.last_step));
  if (step !== null) return (await sql`update public.user_totp set last_step = ${step} where user_id = ${userId} and last_step < ${step} returning user_id`).length > 0;
  const recovery = normaliseRecovery(input);
  if (!recovery) return false;
  return (await sql`update public.recovery_codes set used_at = now() where user_id = ${userId} and code_hash = ${hashRecovery(recovery)} and used_at is null returning id`).length > 0;
}

export async function turnOff(userId: string): Promise<void> {
  await system().begin(async (tx) => {
    await tx`delete from public.user_totp where user_id = ${userId}`;
    await tx`delete from public.recovery_codes where user_id = ${userId}`;
  });
  await audit(userId, 'account.two_step_disabled');
}

export async function replaceRecoveryCodes(userId: string): Promise<string[]> {
  const codes = await freshRecoveryCodes(userId);
  await audit(userId, 'account.recovery_codes_replaced');
  return codes;
}
