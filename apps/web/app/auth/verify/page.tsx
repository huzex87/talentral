import { redirect } from 'next/navigation';
import { Alert } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { completeSignIn } from '@/lib/auth';
import { AuthShell } from '@/components/auth-shell';
import { translator, visitorLanguage } from '@/lib/i18n';

export const metadata = { title: 'Confirm sign-in' };

// Email security scanners open links before people do, so signing in needs a click on this page.
// Welcome links (sent with a hub's acceptance or cohort admission) land in the learner area.
async function confirm(form: FormData) {
  'use server';
  const welcome = form.get('welcome') === '1';
  const done = await completeSignIn(String(form.get('token') ?? ''));
  if (done === 'staff') redirect('/sign-in?notice=staff');
  if (!done) redirect(`/auth/verify?expired=1${welcome ? '&welcome=1' : ''}`);
  redirect(done.result === 'two_step' ? '/auth/two-step' : done.next ?? '/dashboard');
}

export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string; expired?: string; welcome?: string }> }) {
  const { token, expired, welcome } = await searchParams;
  const isWelcome = welcome === '1';
  const lang = await visitorLanguage();
  const t = translator(lang);
  if (expired || !token) {
    return (
      <AuthShell title={t('This link has expired', 'Wannan hanyar ta daina aiki')} lang={lang}>
        <Alert tone="amber">
          {isWelcome
            ? t('Welcome links work once and expire after 7 days. Sign in with the email or phone number you applied with.',
              'Hanyar maraba tana aiki sau ɗaya kuma tana daina aiki bayan kwana 7. Shiga da imel ko lambar wayar da ka nema da ita.')
            : t('Sign-in links work once and expire after 15 minutes.', 'Hanyar shiga tana aiki sau ɗaya kuma tana daina aiki bayan minti 15.')}{' '}
          <a href="/sign-in" className="font-semibold underline">{isWelcome ? t('Sign in', 'Shiga') : t('Request a new link', 'Nemi sabuwar hanya')}</a>.
        </Alert>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title={isWelcome ? t('Welcome to Talentral', 'Barka da zuwa Talentral') : t('Confirm sign-in', 'Tabbatar da shiga')}
      subtitle={isWelcome
        ? t('Open your learner account to see your place, your course and your Talentral Passport.', 'Buɗe asusunka na ɗalibi don ganin gurbinka, darussanka da Fasfonka na Talentral.')
        : t('Continue to your Talentral dashboard.', 'Ci gaba zuwa shafinka na Talentral.')}
      lang={lang}>
      <form action={confirm}>
        <input type="hidden" name="token" value={token} />
        {isWelcome && <input type="hidden" name="welcome" value="1" />}
        <SubmitButton className="w-full" pendingLabel={t('Signing in…', 'Ana shiga…')}>{isWelcome ? t('Open my account', 'Buɗe asusuna') : t('Continue', 'Ci gaba')}</SubmitButton>
      </form>
    </AuthShell>
  );
}
