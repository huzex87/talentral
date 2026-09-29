import { redirect } from 'next/navigation';
import { Alert } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { completeSignIn } from '@/lib/auth';
import { AuthShell } from '@/components/auth-shell';
import { translator, visitorLanguage } from '@/lib/i18n';

export const metadata = { title: 'Confirm sign-in' };

// Email security scanners open links before people do, so signing in needs a click on this page.
async function confirm(form: FormData) {
  'use server';
  const ok = await completeSignIn(String(form.get('token') ?? ''));
  redirect(ok ? '/dashboard' : '/auth/verify?expired=1');
}

export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string; expired?: string }> }) {
  const { token, expired } = await searchParams;
  const lang = await visitorLanguage();
  const t = translator(lang);
  if (expired || !token) {
    return (
      <AuthShell title={t('This link has expired', 'Wannan hanyar ta daina aiki')} lang={lang}>
        <Alert tone="amber">
          {t('Sign-in links work once and expire after 15 minutes.', 'Hanyar shiga tana aiki sau ɗaya kuma tana daina aiki bayan minti 15.')}{' '}
          <a href="/sign-in" className="font-semibold underline">{t('Request a new link', 'Nemi sabuwar hanya')}</a>.
        </Alert>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={t('Confirm sign-in', 'Tabbatar da shiga')} subtitle={t('Continue to your Talentral dashboard.', 'Ci gaba zuwa shafinka na Talentral.')} lang={lang}>
      <form action={confirm}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton className="w-full" pendingLabel={t('Signing in…', 'Ana shiga…')}>{t('Continue', 'Ci gaba')}</SubmitButton>
      </form>
    </AuthShell>
  );
}
