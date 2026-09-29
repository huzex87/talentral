// The reading language for learner-facing screens. Signed-in learners keep it on their account;
// visitors (sign-in, class check-in) keep it in a cookie, first guessed from the browser.
import 'server-only';
import { cookies, headers } from 'next/headers';
import type { Language } from '@talentral/domain';

export type { Language };
export const LANG_COOKIE = 'tl_lang';

export async function visitorLanguage(): Promise<Language> {
  const saved = (await cookies()).get(LANG_COOKIE)?.value;
  if (saved === 'en' || saved === 'ha') return saved;
  const accept = (await headers()).get('accept-language') ?? '';
  return /^\s*ha\b/i.test(accept) ? 'ha' : 'en';
}

// t('English', 'Hausa') picks by language.
export function translator(language: Language) {
  return (en: string, ha: string) => (language === 'ha' ? ha : en);
}
