import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { Alert } from '@/components/ui';
import { currentUser, pendingTwoStep } from '@/lib/auth';
import { translator, visitorLanguage } from '@/lib/i18n';
import { TwoStepForm } from './two-step-form';

export const metadata = { title: 'Two-step sign-in', robots: { index: false } };

export default async function TwoStep() {
  if (await currentUser()) redirect('/dashboard');
  const lang = await visitorLanguage();
  const t = translator(lang);
  const pending = await pendingTwoStep();
  if (!pending) {
    return (
      <AuthShell title={t('Sign in again', 'Sake shiga')} lang={lang}>
        <Alert tone="amber">
          {t('This sign-in has expired or had too many wrong codes.', 'Wannan shigar ta ƙare ko an yi kuskure sau da yawa.')}{' '}
          <a href="/sign-in" className="font-semibold underline">{t('Start again', 'Fara daga farko')}</a>.
        </Alert>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={t('Enter your code', 'Rubuta lambarka')} lang={lang}
      subtitle={t(`Open your authenticator app and enter the 6-digit code for Talentral (${pending.email}).`,
        `Buɗe manhajar authenticator ka rubuta lamba 6 ta Talentral (${pending.email}).`)}>
      <TwoStepForm lang={lang} />
    </AuthShell>
  );
}
