'use client';
import { useState, useTransition } from 'react';
import { Alert, Button, cx } from '@/components/ui';
import { respondToOpportunity, setConsent, type ConsentKind, type PassportState } from './actions';

type Lang = 'en' | 'ha';

const COPY: Record<ConsentKind, Record<Lang, { title: string; body: string }>> = {
  discoverable: {
    en: { title: 'Visible to Talentral talent officers', body: 'Talent officers can find your Passport and suggest you for jobs. Turning this off removes you from search immediately.' },
    ha: { title: 'Jami’an Talentral za su iya gani', body: 'Jami’an Talentral za su iya samun Fasfonka su ba da shawarar ka ga ayyuka. Idan ka kashe wannan, za a cire ka daga bincike nan take.' },
  },
  employer_search: {
    en: { title: 'Let verified employers find me', body: 'Employers that Talentral has verified can see your Passport in their searches and invite you to jobs. They never see your email or phone until you say yes.' },
    ha: { title: 'Bari masu ɗaukar aiki da aka tabbatar su same ni', body: 'Masu ɗaukar aiki da Talentral ta tabbatar za su iya ganin Fasfonka a bincikensu su gayyace ka. Ba za su ga imel ko lambar wayarka ba sai ka amince.' },
  },
  employer_sharing: {
    en: { title: 'Share with employers I say yes to', body: 'When you confirm interest in a job, the employer can see your Passport through a private link that expires after 14 days.' },
    ha: { title: 'Raba da masu ɗaukar aikin da na amince da su', body: 'Idan ka tabbatar kana son wani aiki, mai ɗaukar aikin zai iya ganin Fasfonka ta wata hanya ta sirri da za ta daina aiki bayan kwana 14.' },
  },
  research: {
    en: { title: 'Include me in anonymised research', body: 'Your record may be counted, without your name, in reports on programme outcomes.' },
    ha: { title: 'Saka ni cikin bincike ba tare da sunana ba', body: 'Ana iya ƙidaya bayananka, ba tare da sunanka ba, a cikin rahotannin sakamakon shirye-shirye.' },
  },
};

export function ConsentSwitch({ kind, on, since, blocked, lang = 'en' }: { kind: ConsentKind; on: boolean; since: string | null; blocked?: string; lang?: Lang }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PassportState | null>(null);
  const { title, body } = COPY[kind][lang];
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id={`consent-${kind}`} className="font-semibold">{title}</p>
          <p className="mt-0.5 text-sm text-muted">{body}</p>
          <p className="mt-1 text-xs font-semibold text-muted">{on ? (lang === 'ha' ? `A kunne tun ${since}` : `On since ${since}`) : lang === 'ha' ? 'A kashe' : 'Off'}</p>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-labelledby={`consent-${kind}`} disabled={pending}
          onClick={() => start(async () => setResult(await setConsent(kind, !on)))}
          className={cx('relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-60', on ? 'bg-teal-700' : 'bg-mist')}>
          <span className={cx('inline-block size-5 rounded-full bg-white shadow transition', on ? 'translate-x-6' : 'translate-x-1')} />
        </button>
      </div>
      {!on && blocked && <p className="mt-2 text-xs text-amber-800">{blocked}</p>}
      {result?.message && <div className="mt-2"><Alert tone="amber">{result.message}</Alert></div>}
    </div>
  );
}

export function InterestButtons({ id, role, lang = 'en' }: { id: string; role: string; lang?: Lang }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PassportState | null>(null);
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={pending} onClick={() => start(async () => setResult(await respondToOpportunity(id, 'confirmed')))} aria-label={t(`I am interested in ${role}`, `Ina son ${role}`)}>{t('I am interested', 'Ina so')}</Button>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => setResult(await respondToOpportunity(id, 'declined')))} aria-label={t(`Not for me: ${role}`, `Ba nawa ba ne: ${role}`)}>{t('Not for me', 'Ba nawa ba ne')}</Button>
      {result?.message && <span className="text-sm text-danger">{result.message}</span>}
    </div>
  );
}
