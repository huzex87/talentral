'use client';
import { useState, useTransition } from 'react';
import { Check, X } from 'lucide-react';
import { Alert, Button } from '@/components/ui';
import { answerRole, type ReplyState } from './actions';

export function ReplyButtons({ token, lang, employer, current, placed }: {
  token: string; lang: 'en' | 'ha'; employer: string; current: 'pending' | 'confirmed' | 'declined'; placed: boolean;
}) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const [state, setState] = useState<ReplyState>({});
  const [pending, start] = useTransition();
  const answer = state.done ?? (current === 'pending' ? null : current);
  const send = (interest: 'confirmed' | 'declined') => start(async () => setState(await answerRole(token, interest)));

  if (placed) return <Alert tone="teal">{t('You have been hired for this role. Congratulations.', 'An ɗauke ka aiki a wannan matsayi. Barka da warhaka.')}</Alert>;
  return (
    <div className="space-y-3">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {answer === 'confirmed' && (
        <Alert tone="teal" title={t('You said yes', 'Ka ce eh')}>
          {t(`We have told the Talentral team. If sharing with employers is on in your Passport, ${employer} can now see it and contact you.`,
            `Mun sanar da ƙungiyar Talentral. Idan raba bayanai da masu ɗaukar aiki yana kunne a Fasfonka, ${employer} za su iya ganin sa su tuntuɓe ka.`)}
        </Alert>
      )}
      {answer === 'declined' && (
        <Alert tone="neutral" title={t('You said no', 'Ka ce a\'a')}>
          {t('Nothing was shared. Thank you for letting us know; we will keep looking for roles that fit you better.', 'Ba a raba komai ba. Mun gode da sanar da mu; za mu ci gaba da neman aikin da ya fi dacewa da kai.')}
        </Alert>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" onClick={() => send('confirmed')} disabled={pending || answer === 'confirmed'} aria-busy={pending} className="h-12 w-full">
          <Check aria-hidden />{t('Yes, I am interested', 'Eh, ina so')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => send('declined')} disabled={pending || answer === 'declined'} className="h-12 w-full">
          <X aria-hidden />{t('Not for me', 'Ba ni ba')}
        </Button>
      </div>
      {answer && <p className="text-center text-xs text-muted">{t('Changed your mind? Tap the other answer.', 'Ka canza ra\'ayi? Taɓa ɗayan amsar.')}</p>}
    </div>
  );
}
