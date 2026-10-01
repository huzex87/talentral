'use client';
// Applying with the Passport, and withdrawing. The form says exactly what the employer will see.
import { useActionState, useState, useTransition } from 'react';
import { COVER_NOTE_MAX } from '@talentral/domain';
import { Alert, Button, Field, Textarea } from '@/components/ui';
import { keepValues } from '@/lib/keep-values';
import { applyToJob, withdrawApplication, type ApplyState } from './actions';

type Lang = 'en' | 'ha';

export function ApplyForm({ jobId, employer, sharing, lang }: { jobId: string; employer: string; sharing: boolean; lang: Lang }) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const [state, action, pending] = useActionState<ApplyState, FormData>(applyToJob.bind(null, jobId), {});
  const [note, setNote] = useState('');
  const e = state.errors ?? {};
  return (
    <form onSubmit={keepValues(action)} className="mt-3 space-y-3" aria-label={t('Apply for this job', 'Nemi wannan aikin')}>
      <Field label={t('A short note to the employer (optional)', 'Ɗan gajeren saƙo ga mai ɗaukar aikin (ba dole ba)')} htmlFor="apply-note" error={e.note}
        hint={`${note.length.toLocaleString('en-NG')} / ${COVER_NOTE_MAX.toLocaleString('en-NG')}`}>
        <Textarea id="apply-note" name="note" rows={4} maxLength={COVER_NOTE_MAX} value={note} onChange={(ev) => setNote(ev.target.value)}
          placeholder={t('Why this job, and one thing you built that shows you can do it.', 'Me ya sa wannan aikin, da wani abu da ka yi da ke nuna za ka iya.')} />
      </Field>
      {!sharing && (
        <div>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="share" className="mt-0.5 size-4 accent-blue" required aria-describedby={e.share ? 'apply-share-error' : undefined} />
            <span>{t('Share my Passport with employers I apply to or say yes to', 'Raba Fasfona da masu ɗaukar aikin da na nema ko na amince da su')}</span>
          </label>
          {e.share && <p id="apply-share-error" className="mt-1 text-sm text-danger">{e.share}</p>}
        </div>
      )}
      <p className="text-xs text-muted">{t(`${employer} will see your Passport (skills, graded work, portfolio and certificates), your note, and your email and phone number. You can withdraw at any time.`,
        `${employer} za su ga Fasfonka (ƙwarewa, ayyukan da aka duba, tarin ayyuka da takaddun shaida), saƙonka, da imel da lambar wayarka. Za ka iya janyewa a kowane lokaci.`)}</p>
      <Button type="submit" className="w-full" disabled={pending} aria-busy={pending}>{pending ? t('Sending…', 'Ana aikawa…') : t('Apply with my Passport', 'Nema da Fasfona')}</Button>
      {state.message && !state.ok && <Alert tone="amber">{state.message}</Alert>}
    </form>
  );
}

export function WithdrawButton({ id, role, lang }: { id: string; role: string; lang: Lang }) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<ApplyState | null>(null);
  if (result?.ok) return <p role="status" className="text-sm text-muted">{result.message}</p>;
  if (!asking) {
    return <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(true)} aria-label={t(`Withdraw application for ${role}`, `Janye neman ${role}`)}>{t('Withdraw', 'Janye')}</Button>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('Confirm withdrawal', 'Tabbatar da janyewa')}>
      <span className="text-sm">{t('Withdraw? The employer will no longer see your application.', 'Ka janye? Mai ɗaukar aikin ba zai ƙara ganin neman ka ba.')}</span>
      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => start(async () => setResult(await withdrawApplication(id)))}>{t('Yes, withdraw', 'Eh, janye')}</Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)}>{t('Keep it', 'Bar shi')}</Button>
      {result?.message && <span className="text-sm text-danger">{result.message}</span>}
    </div>
  );
}
