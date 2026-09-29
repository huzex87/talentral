'use client';
import { useActionState } from 'react';
import { Alert, Card, Field, Input } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { checkIn, type CheckinState } from './actions';

export function CheckinForm({ hub, lang = 'en' }: { hub: string; lang?: 'en' | 'ha' }) {
  const [state, action] = useActionState<CheckinState, FormData>(checkIn.bind(null, hub), {});
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  if (state.ok) {
    const first = state.learner?.split(' ')[0];
    return (
      <Card className="p-7 text-center sm:p-10">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-teal-50 text-teal-700">
          <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <h1 className="mt-5 text-2xl font-semibold">{t(`You're checked in, ${first}`, `An yi maka rajista, ${first}`)}</h1>
        <p className="mt-2 text-muted">{state.session}</p>
        <p className="mt-4 inline-block rounded-full bg-canvas px-4 py-1.5 text-sm font-semibold">{state.status === 'late' ? t('Marked late', 'An rubuta ka makara') : t('Marked present', 'An rubuta kana nan')}</p>
      </Card>
    );
  }
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-2xl font-semibold">{t('Check in to class', 'Rajistar shiga aji')}</h1>
      <p className="mt-1.5 text-muted">{t('Enter the code your facilitator shared, then your application reference number or phone number.',
        'Rubuta lambar da malaminka ya bayar, sannan lambar shaidar takardar neman shiga ko lambar wayarka.')}</p>
      <form action={action} className="mt-6 space-y-5">
        {state.message && <Alert tone="danger">{state.message}</Alert>}
        <Field label={t('Class code', 'Lambar aji')} htmlFor="code">
          <Input id="code" name="code" defaultValue={state.code} autoComplete="off" autoCapitalize="characters" maxLength={6} inputMode="text"
            className="h-14 text-center font-mono text-2xl uppercase tracking-[0.4em]" placeholder="ABC234" required />
        </Field>
        <Field label={t('Reference number or phone', 'Lambar shaida ko waya')} htmlFor="identity" hint={t('For example KIR-26-7QK4P or 0803 123 4567.', 'Misali KIR-26-7QK4P ko 0803 123 4567.')}>
          <Input id="identity" name="identity" defaultValue={state.identity} autoComplete="tel" className="h-12 text-lg" required />
        </Field>
        <SubmitButton variant="hub" className="h-12 w-full text-base" pendingLabel={t('Checking in…', 'Ana rajista…')}>{t('Check in', 'Yi rajista')}</SubmitButton>
      </form>
    </Card>
  );
}
