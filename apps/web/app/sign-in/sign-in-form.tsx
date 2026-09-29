'use client';
import { useActionState, useState } from 'react';
import { Alert, Field, Input, cx } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { sendCode, sendLink, verifyCode, type PhoneState, type SignInState } from './actions';

type T = (en: string, ha: string) => string;
type Method = 'email' | 'phone';

export function SignInForm({ lang, initial }: { lang: 'en' | 'ha'; initial: Method }) {
  const [method, setMethod] = useState<Method>(initial);
  const t: T = (en, ha) => (lang === 'ha' ? ha : en);
  return (
    <div>
      <div role="tablist" aria-label={t('Sign in with', 'Shiga da')} className="mb-6 grid grid-cols-2 rounded-xl bg-canvas p-1 text-sm font-semibold">
        {(['email', 'phone'] as const).map((m) => (
          <button key={m} type="button" role="tab" id={`tab-${m}`} aria-selected={method === m} aria-controls={`panel-${m}`} onClick={() => setMethod(m)}
            className={cx('flex h-10 items-center justify-center gap-2 rounded-lg transition', method === m ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink')}>
            <span aria-hidden>{m === 'email' ? '✉️' : '📱'}</span>{m === 'email' ? t('Email', 'Imel') : t('Phone', 'Waya')}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${method}`} aria-labelledby={`tab-${method}`}>
        {method === 'email' ? <EmailForm t={t} /> : <PhoneForm t={t} />}
      </div>
    </div>
  );
}

function EmailForm({ t }: { t: T }) {
  const [state, action] = useActionState<SignInState, FormData>(sendLink, {});
  if (state.sent) {
    return (
      <Alert tone="teal" title={t('Check your email', 'Duba imel ɗinka')}>
        {t(`If ${state.email} belongs to a Talentral account, a sign-in link is on its way. It expires in 15 minutes.`,
          `Idan ${state.email} na da asusun Talentral, an aika maka hanyar shiga. Za ta daina aiki bayan minti 15.`)}
      </Alert>
    );
  }
  return (
    <form action={action} className="space-y-5">
      <Field label={t('Email address', 'Adireshin imel')} htmlFor="email" error={state.error}
        hint={t('Learners: the email you applied with.', 'Ɗalibai: imel ɗin da ka yi amfani da shi wajen neman shiga.')}>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={state.email} required autoFocus />
      </Field>
      <SubmitButton className="w-full" pendingLabel={t('Sending link…', 'Ana aikawa…')}>{t('Email me a sign-in link', 'Aiko mini hanyar shiga ta imel')}</SubmitButton>
    </form>
  );
}

function PhoneForm({ t }: { t: T }) {
  const [sent, request] = useActionState<PhoneState, FormData>(sendCode, { step: 'number' });
  const [checked, verify] = useActionState<PhoneState, FormData>(verifyCode, { step: 'code' });
  const [changingAt, setChangingAt] = useState(0);
  const onCode = sent.step === 'code' && (sent.at ?? 0) > changingAt;
  // Show the latest message: a failed check, unless a new code was sent after it.
  const error = checked.phone === sent.phone && (checked.at ?? 0) > (sent.at ?? 0) ? checked.error : undefined;

  if (!onCode) {
    return (
      <form action={request} className="space-y-5">
        <Field label={t('Mobile number', 'Lambar waya')} htmlFor="phone" error={sent.step === 'number' ? sent.error : undefined}
          hint={t('Learners: the number on your application. We will text you a 6-digit code.', 'Ɗalibai: lambar da ke kan takardar neman shiga. Za mu aiko maka lamba 6 ta SMS.')}>
          <Input id="phone" name="phone" type="tel" autoComplete="tel-national" inputMode="tel" placeholder="0803 123 4567"
            defaultValue={sent.step === 'number' ? sent.input : undefined} required autoFocus className="text-lg tracking-wide" />
        </Field>
        <SubmitButton className="w-full" pendingLabel={t('Sending code…', 'Ana aikawa…')}>{t('Text me a code', 'Aiko mini lamba ta SMS')}</SubmitButton>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <p className="rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-700" role="status">
        {sent.resent
          ? t(`A new code is on its way to ${sent.masked}.`, `Sabuwar lamba na zuwa ${sent.masked}.`)
          : t(`If this number belongs to a Talentral learner, a code is on its way to ${sent.masked}.`, `Idan wannan lambar ta ɗalibin Talentral ce, lamba na zuwa ${sent.masked}.`)}
        {' '}{t('It expires in 10 minutes.', 'Za ta daina aiki bayan minti 10.')}
      </p>
      <form action={verify} className="space-y-5">
        <input type="hidden" name="phone" value={sent.phone} />
        <Field label={t('6-digit code', 'Lamba mai lambobi 6')} htmlFor="code" error={error}>
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required autoFocus
            className="h-14 text-center font-mono text-2xl tracking-[0.5em]" placeholder="••••••" />
        </Field>
        <SubmitButton className="w-full" pendingLabel={t('Checking…', 'Ana dubawa…')}>{t('Sign in', 'Shiga')}</SubmitButton>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <form action={request}>
          <input type="hidden" name="phone" value={sent.phone} />
          <input type="hidden" name="resend" value="1" />
          <button className="font-semibold text-blue hover:underline">{t('Send a new code', 'Aiko sabuwar lamba')}</button>
        </form>
        <button type="button" onClick={() => setChangingAt(Date.now())} className="font-semibold text-muted hover:text-ink">{t('Use a different number', 'Yi amfani da wata lamba')}</button>
      </div>
    </div>
  );
}
