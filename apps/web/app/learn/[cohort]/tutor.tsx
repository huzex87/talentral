'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { BookOpen, Sparkles } from 'lucide-react';
import { Button, Textarea, cx } from '@/components/ui';
import { askTutorAction } from '../tutor-actions';

export type TutorItem = { id: string; question: string; answer: string | null; status: 'pending' | 'answered' | 'declined' | 'failed'; citations: { lesson_id: string; title: string }[] };

// "Ask the tutor" for a cohort, optionally anchored on the lesson the learner is reading.
export function TutorPanel({ cohortId, lessonId, lang, history }: { cohortId: string; lessonId: string | null; lang: 'en' | 'ha'; history: TutorItem[] }) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const [items, setItems] = useState<TutorItem[]>(history);
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ask = () => start(async () => {
    setError(null);
    const r = await askTutorAction(cohortId, lessonId, question, lang);
    if (!r.ok) { setError(r.error); return; }
    setItems((prev) => [{ id: crypto.randomUUID(), question: question.trim(), answer: r.answer, status: r.status, citations: r.citations }, ...prev].slice(0, 6));
    setQuestion('');
  });

  return (
    <section aria-labelledby="tutor-title" className="rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3 border-b border-line p-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-violet/15 bg-violet-50 text-violet"><Sparkles className="size-[18px]" aria-hidden strokeWidth={1.75} /></span>
        <div className="min-w-0">
          <h2 id="tutor-title" className="flex items-center gap-2 text-base font-semibold">{t('Ask the tutor', 'Tambayi malamin AI')}<span className="rounded-md border border-line bg-hover px-1.5 py-px text-[11px] font-medium text-ink-2">Beta</span></h2>
          <p className="mt-0.5 text-sm text-muted">{t('Answers come only from your course lessons, with the lesson to read. Check important points with your facilitator.', 'Amsoshi suna fitowa daga darussan kwas ɗinka kawai, tare da darasin da za ka karanta. Tabbatar da muhimman abubuwa wurin mai koyarwa.')}</p>
        </div>
      </div>
      <form className="space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <label htmlFor="tutor-q" className="sr-only">{t('Your question', 'Tambayarka')}</label>
        <Textarea id="tutor-q" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={1000} rows={3} className="min-h-20"
          placeholder={t('For example: what is the difference between a div and a span?', 'Misali: menene bambanci tsakanin div da span?')} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">{t('Questions are kept for 30 days, only for you.', 'Ana ajiye tambayoyi kwana 30, domin kai kaɗai.')}</p>
          <Button type="submit" disabled={pending || question.trim().length < 3} aria-busy={pending}>{pending ? t('Thinking…', 'Ana tunani…') : t('Ask', 'Tambaya')}</Button>
        </div>
        {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
      </form>
      {items.length > 0 && (
        <ol className="divide-y divide-line border-t border-line" aria-label={t('Your questions', 'Tambayoyinka')} aria-live="polite">
          {items.map((it) => (
            <li key={it.id} className="space-y-2 p-5">
              <p className="text-sm font-medium text-ink">{it.question}</p>
              {it.answer
                ? <p className={cx('whitespace-pre-line text-sm leading-relaxed', it.status === 'answered' ? 'text-ink-2' : 'text-muted')}>{it.answer}</p>
                : <p className="text-sm text-muted">{t('No answer was saved for this question.', 'Ba a ajiye amsa ga wannan tambayar ba.')}</p>}
              {it.citations.length > 0 && (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                  <span className="text-muted">{t('Read more:', 'Karanta:')}</span>
                  {it.citations.map((c) => (
                    <Link key={c.lesson_id} href={`/learn/${cohortId}/${c.lesson_id}`} className="inline-flex items-center gap-1 font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                      <BookOpen className="size-3.5 text-muted" aria-hidden />{c.title}
                    </Link>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
