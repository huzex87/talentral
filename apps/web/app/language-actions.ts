'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { withUser } from '@talentral/db';
import { currentUser } from '@/lib/auth';
import { env } from '@/lib/env';
import { LANG_COOKIE } from '@/lib/i18n';

// Saves the reading language on the device and, for signed-in people, on their account so it
// follows them to other phones and into SMS and email.
export async function chooseLanguage(language: 'en' | 'ha'): Promise<void> {
  const lang = language === 'ha' ? 'ha' : 'en';
  (await cookies()).set(LANG_COOKIE, lang, { path: '/', sameSite: 'lax', secure: env.production, maxAge: 365 * 24 * 3600 });
  const user = await currentUser();
  if (user) await withUser(user.id, (tx) => tx`update public.users set language = ${lang} where id = ${user.id}`);
  revalidatePath('/', 'layout');
}
