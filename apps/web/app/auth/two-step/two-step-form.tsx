'use client';
import { useActionState, useState } from 'react';
import { Field, Input } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { verifyTwoStep, type TwoStepState } from './actions';

export function TwoStepForm({ lang }: { lang: 'en' | 'ha' }) {
  const [state, action] = useActionState<TwoStepState, FormData>(verifyTwoStep, {});
  const [recovery, setRecovery] = useState(false);
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  return (
    <form action={action} className="space-y-5">
      {recovery ? (
        <Field label={t('Recovery code', 'Lambar gaggawa')} htmlFor="code" error={state.error}
          hint={t('One of the codes you saved when you turned on two-step sign-in, like 7K3Q-M9PX. Each works once.', 'Ɗaya daga cikin lambobin da ka ajiye, kamar 7K3Q-M9PX. Kowacce tana aiki sau ɗaya.')}>
          <Input id="code" name="code" autoComplete="off" autoCapitalize="characters" required autoFocus className="h-14 text-center font-mono text-xl uppercase tracking-[0.2em]" placeholder="XXXX-XXXX" />
        </Field>
      ) : (
        <Field label={t('Authenticator code', 'Lambar authenticator')} htmlFor="code" error={state.error}>
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required autoFocus
            className="h-14 text-center font-mono text-2xl tracking-[0.5em]" placeholder="••••••" />
        </Field>
      )}
      <SubmitButton className="w-full" pendingLabel={t('Checking…', 'Ana dubawa…')}>{t('Sign in', 'Shiga')}</SubmitButton>
      <button type="button" onClick={() => setRecovery(!recovery)} className="w-full text-center text-sm font-semibold text-blue hover:underline">
        {recovery ? t('Use my authenticator app', 'Yi amfani da manhajar authenticator') : t('Lost your phone? Use a recovery code', 'Ka rasa wayarka? Yi amfani da lambar gaggawa')}
      </button>
    </form>
  );
}
