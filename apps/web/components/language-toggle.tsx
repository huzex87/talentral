'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { chooseLanguage } from '@/app/language-actions';
import { cx } from './ui';

// English or Hausa for every learner screen. Signed-in learners keep the choice on their account.
// `compact` shows EN / HA on phones so the toggle fits in a header; the full names stay as the accessible names.
export function LanguageToggle({ language, tone = 'light', compact = false }: { language: 'en' | 'ha'; tone?: 'light' | 'dark'; compact?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={cx('font-medium', compact && 'hidden md:inline', tone === 'dark' ? 'text-white/70' : 'text-muted')} aria-hidden>{language === 'ha' ? 'Harshe' : 'Language'}</span>
      <div className={cx('flex rounded-lg p-0.5 font-medium', tone === 'dark' ? 'bg-white/10' : 'bg-hover')}
        role="radiogroup" aria-label={language === 'ha' ? 'Harshe' : 'Language'}>
        {(['en', 'ha'] as const).map((l) => (
          <button key={l} type="button" role="radio" aria-checked={language === l} disabled={pending} lang={l} aria-label={l === 'en' ? 'English' : 'Hausa'}
            onClick={() => start(async () => { await chooseLanguage(l); router.refresh(); })}
            className={cx('rounded-md py-1 transition-colors', compact ? 'px-2 md:px-2.5' : 'px-2.5', language === l ? (tone === 'dark' ? 'bg-white text-ink' : 'bg-white text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)] ring-1 ring-line') : tone === 'dark' ? 'text-white/75 hover:text-white' : 'text-muted hover:text-ink')}>
            {compact ? (<><span className="md:hidden" aria-hidden>{l.toUpperCase()}</span><span className="hidden md:inline">{l === 'en' ? 'English' : 'Hausa'}</span></>) : l === 'en' ? 'English' : 'Hausa'}
          </button>
        ))}
      </div>
    </div>
  );
}
