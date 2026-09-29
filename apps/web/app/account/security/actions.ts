'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { beginSetup, checkCode, confirmSetup, replaceRecoveryCodes, turnOff, twoStepStatus } from '@/lib/two-step';

export interface SetupState { step: 'start' | 'scan' | 'done'; secret?: string; qr?: string; codes?: string[]; error?: string }

export async function startSetup(): Promise<SetupState> {
  const user = await requireUser();
  const { secret, qr } = await beginSetup(user.id, user.email);
  return { step: 'scan', secret, qr };
}

export async function finishSetup(prev: SetupState, form: FormData): Promise<SetupState> {
  const user = await requireUser();
  const codes = await confirmSetup(user.id, String(form.get('code') ?? ''));
  if (!codes) return { ...prev, error: 'That code is not right. Check the app shows Talentral and enter the code showing now.' };
  // No revalidation here: refreshing the page would replace this panel before the person has
  // saved their recovery codes. The status badge updates on the next visit.
  return { step: 'done', codes };
}

export interface ChangeState { ok?: boolean; error?: string; codes?: string[] }

export async function disableTwoStep(_prev: ChangeState, form: FormData): Promise<ChangeState> {
  const user = await requireUser();
  const status = await twoStepStatus(user.id);
  if (status.requiredBy.length) return { error: `${status.requiredBy.join(', ')} requires two-step sign-in for its team, so it has to stay on.` };
  if (!(await checkCode(user.id, String(form.get('code') ?? '')))) return { error: 'That code is not right.' };
  await turnOff(user.id);
  revalidatePath('/account/security');
  return { ok: true };
}

export async function newCodes(_prev: ChangeState, form: FormData): Promise<ChangeState> {
  const user = await requireUser();
  if (!(await checkCode(user.id, String(form.get('code') ?? '')))) return { error: 'That code is not right.' };
  return { ok: true, codes: await replaceRecoveryCodes(user.id) };
}
