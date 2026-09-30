'use server';
import { redirect } from 'next/navigation';
import { completeTwoStep } from '@/lib/auth';
import { translator, visitorLanguage } from '@/lib/i18n';

export interface TwoStepState { error?: string }

export async function verifyTwoStep(_prev: TwoStepState, form: FormData): Promise<TwoStepState> {
  const t = translator(await visitorLanguage());
  const result = await completeTwoStep(String(form.get('code') ?? '').slice(0, 20));
  if (result === 'ok') redirect('/dashboard');
  if (result === 'expired') redirect('/auth/two-step');
  return { error: t('That code is not right. Codes change every 30 seconds; enter the one showing now.', 'Wannan lambar ba daidai ba ce. Lambobin suna canzawa kowane daƙiƙa 30; rubuta wadda ke nuni yanzu.') };
}
