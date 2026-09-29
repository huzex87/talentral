'use client';
import { useTransition } from 'react';
import { setLanguage } from '@/app/learn/actions';
import { cx } from './ui';

export function LanguageToggle({ language }: { language: 'en' | 'ha' }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-semibold text-muted">{language === 'ha' ? 'Harshe' : 'Lesson language'}</span>
      <div className="flex rounded-lg border border-line bg-white p-0.5 font-semibold" role="radiogroup" aria-label="Lesson language">
        {(['en', 'ha'] as const).map((l) => (
          <button key={l} type="button" role="radio" aria-checked={language === l} disabled={pending} onClick={() => start(() => setLanguage(l))}
            className={cx('rounded-md px-2.5 py-1 transition', language === l ? 'bg-blue text-white' : 'text-muted hover:text-ink')}>{l === 'en' ? 'English' : 'Hausa'}</button>
        ))}
      </div>
    </div>
  );
}
