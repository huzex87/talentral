'use server';
import { z } from 'zod';
import { requestSignIn } from '@/lib/auth';

export interface SignInState { sent?: boolean; error?: string; email?: string }

export async function sendLink(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = z.string().trim().toLowerCase().email().safeParse(form.get('email'));
  if (!email.success) return { error: 'Enter a valid email address.', email: String(form.get('email') ?? '') };
  await requestSignIn(email.data);
  return { sent: true, email: email.data };
}
