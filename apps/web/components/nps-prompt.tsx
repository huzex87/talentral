'use client';
import { useState, useTransition } from 'react';
import { npsCategory, type NpsAudience } from '@talentral/domain';
import { submitNps } from '@/app/nps-actions';
import { Button, Textarea, cx } from '@/components/ui';

type Lang = 'en' | 'ha';

// The NPS question as a small card: pick 0 to 10, optionally say why, send. "Not now" asks again
// in two weeks. Learners read it in their language; staff in English.
export function NpsPrompt({ tenantId, cohortId, audience, hubName, lang = 'en', className }: { tenantId: string; cohortId: string | null; audience: NpsAudience; hubName: string; lang?: Lang; className?: string }) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState<'sent' | 'later' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = (value: number | null) => start(async () => {
    setError(null);
    const r = await submitNps(tenantId, cohortId, audience, value, value === null ? '' : comment);
    if (r.ok) setDone(value === null ? 'later' : 'sent');
    else setError(lang === 'ha' ? 'Ba mu iya ajiye amsarka ba. Da fatan a sake gwadawa.' : r.message ?? 'We could not save your answer.');
  });

  if (done === 'later') return null;
  const question = audience === 'learner'
    ? t(`How likely are you to recommend learning with ${hubName} on Talentral to a friend?`, `Yaya yiwuwar ka ba aboki shawarar koyo da ${hubName} a Talentral?`)
    : `How likely are you to recommend Talentral to another hub or training programme?`;
  const why = score === null ? '' : npsCategory(score) === 'promoter' ? t('What do you like most?', 'Me ka fi so?') : t('What would make it better?', 'Me zai sa ya fi kyau?');

  return (
    <section aria-labelledby="nps-q" className={cx(className, 'rounded-[var(--radius-card)] border border-violet/25 bg-white p-5 shadow-[var(--shadow-card)] sm:p-6')}>
      {done === 'sent' ? (
        <div role="status" className="flex items-start gap-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-teal-50 text-lg text-teal-700">✓</span>
          <div>
            <p className="font-semibold">{t('Thank you!', 'Mun gode!')}</p>
            <p className="text-sm text-muted">{audience === 'learner'
              ? t(`Your answer helps ${hubName} and Talentral get better. It is shared without your name.`, `Amsarka tana taimaka wa ${hubName} da Talentral su inganta. Ana raba ta ba tare da sunanka ba.`)
              : 'Your answer helps us make Talentral better for your team.'}</p>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">{t('Quick question', 'Tambaya ɗaya')}</p>
          <h2 id="nps-q" className="mt-1 text-lg font-semibold leading-snug">{question}</h2>
          <fieldset className="mt-4" disabled={pending}>
            <legend className="sr-only">{t('Choose a score from 0 (not likely) to 10 (very likely)', 'Zaɓi maki daga 0 (ba zai yiwu ba) zuwa 10 (tabbas)')}</legend>
            <div className="grid grid-cols-11 gap-1 sm:gap-1.5">
              {Array.from({ length: 11 }, (_, n) => (
                <label key={n} className={cx('relative grid h-11 cursor-pointer place-items-center rounded-lg border text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue/40',
                  score === n ? 'border-violet bg-violet text-white' : 'border-line bg-white text-ink hover:border-violet/50 hover:bg-violet-50/50')}>
                  <input type="radio" name="nps-score" value={n} checked={score === n} onChange={() => setScore(n)} className="sr-only" />
                  {n}
                </label>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-muted" aria-hidden>
              <span>{t('Not likely', 'Ba zai yiwu ba')}</span><span>{t('Very likely', 'Tabbas zan yi')}</span>
            </div>
          </fieldset>
          {score !== null && (
            <div className="mt-4">
              <label htmlFor="nps-comment" className="block text-sm font-semibold">{why} <span className="font-normal text-muted">({t('optional', 'ba dole ba')})</span></label>
              <Textarea id="nps-comment" rows={3} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} className="mt-1.5" disabled={pending} />
            </div>
          )}
          {error && <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" disabled={score === null || pending} onClick={() => send(score)}>{pending ? t('Sending…', 'Ana aikawa…') : t('Send', 'Aika')}</Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => send(null)}>{t('Not now', 'Ba yanzu ba')}</Button>
            <span className="text-xs text-muted">{t('Shared with the hub without your name.', 'Ana raba ta da cibiyar ba tare da sunanka ba.')}</span>
          </div>
        </>
      )}
    </section>
  );
}
