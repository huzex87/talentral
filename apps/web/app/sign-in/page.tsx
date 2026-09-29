import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { LanguageToggle } from '@/components/language-toggle';
import { currentUser } from '@/lib/auth';
import { translator, visitorLanguage } from '@/lib/i18n';
import { SignInForm } from './sign-in-form';

export const metadata = { title: 'Sign in' };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ with?: string }> }) {
  if (await currentUser()) redirect('/dashboard');
  const lang = await visitorLanguage();
  const t = translator(lang);
  const { with: method } = await searchParams;
  return (
    <AuthShell title={t('Sign in', 'Shiga')} lang={lang} aside={<LanguageToggle language={lang} />}
      subtitle={t('For hub teams, learners and Talentral staff. There is no password to remember: we send you a secure link or code.',
        'Don ma’aikatan cibiya, ɗalibai da ma’aikatan Talentral. Babu kalmar sirri da za ka tuna: za mu aiko maka hanyar shiga ko lamba.')}>
      <SignInForm lang={lang} initial={method === 'phone' ? 'phone' : 'email'} />
    </AuthShell>
  );
}
