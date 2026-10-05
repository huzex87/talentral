'use server';
import { allowFromAddress, TOO_MANY } from '@/lib/rate';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { isPhoneCode, maskPhone, normalizePhone } from '@talentral/domain';
import { completePhoneSignIn, requestPhoneCode, requestSignIn } from '@/lib/auth';
import { translator, visitorLanguage } from '@/lib/i18n';

export interface SignInState { sent?: boolean; error?: string; email?: string }

export async function sendLink(_prev: SignInState, form: FormData): Promise<SignInState> {
  const t = translator(await visitorLanguage());
  const email = z.string().trim().toLowerCase().email().safeParse(form.get('email'));
  if (!email.success) return { error: t('Enter a valid email address.', 'Rubuta adireshin imel daidai.'), email: String(form.get('email') ?? '') };
  if (!(await allowFromAddress('signIn'))) return { error: t(TOO_MANY.en, TOO_MANY.ha), email: email.data };
  await requestSignIn(email.data);
  return { sent: true, email: email.data };
}

export interface PhoneState { step: 'number' | 'code'; phone?: string; masked?: string; input?: string; error?: string; resent?: boolean; at?: number }

// Step one: text a code. The reply is the same whether or not the number belongs to a learner.
export async function sendCode(_prev: PhoneState, form: FormData): Promise<PhoneState> {
  const t = translator(await visitorLanguage());
  const input = String(form.get('phone') ?? '');
  const phone = normalizePhone(input);
  if (phone && !(await allowFromAddress('signIn'))) return { step: 'number', input, error: t(TOO_MANY.en, TOO_MANY.ha) };
  if (!phone) return { step: 'number', input, error: t('Enter a Nigerian mobile number, such as 0803 123 4567.', 'Rubuta lambar wayar Najeriya, kamar 0803 123 4567.') };
  await requestPhoneCode(phone);
  return { step: 'code', phone, masked: maskPhone(phone), resent: form.get('resend') === '1', at: Date.now() };
}

// Step two: check the code and sign in.
export async function verifyCode(_prev: PhoneState, form: FormData): Promise<PhoneState> {
  const t = translator(await visitorLanguage());
  const phone = normalizePhone(String(form.get('phone') ?? ''));
  const code = String(form.get('code') ?? '').replace(/\s/g, '');
  if (phone && !(await allowFromAddress('verifyCode'))) return { step: 'code', phone, masked: maskPhone(phone), error: t(TOO_MANY.en, TOO_MANY.ha) };
  if (!phone) return { step: 'number' };
  const back = { step: 'code' as const, phone, masked: maskPhone(phone), at: Date.now() };
  if (!isPhoneCode(code)) return { ...back, error: t('Enter the 6-digit code from the text message.', 'Rubuta lamba 6 da ke cikin saƙon.') };
  const result = await completePhoneSignIn(phone, code);
  if (result === 'ok') redirect('/dashboard');
  if (result === 'two_step') redirect('/auth/two-step');
  const errors = {
    wrong: t('That code is not right. Check the message and try again.', 'Wannan lambar ba daidai ba ce. Duba saƙon ka sake gwadawa.'),
    expired: t('That code has expired or was replaced. Send a new code.', 'Lambar ta daina aiki ko an maye gurbinta. Nemi sabuwar lamba.'),
    locked: t('Too many wrong tries. Send a new code.', 'An yi kuskure sau da yawa. Nemi sabuwar lamba.'),
  } as const;
  return { ...back, error: errors[result] };
}
