'use client';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SUBMISSION_FILES, pick } from '@talentral/domain';
import { DirectUpload } from '@/components/direct-upload';
import { Alert, Badge, Button, Field, Input, Textarea, cx } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { completeLesson, prepareSubmissionUpload, submitAssignment, submitQuiz, type QuizResult, type SubmitState } from '../../actions';

type Lang = 'en' | 'ha';

export function CompleteButton({ cohortId, lessonId, done, lang }: { cohortId: string; lessonId: string; done: boolean; lang: Lang }) {
  const [pending, start] = useTransition();
  const [isDone, setDone] = useState(done);
  if (isDone) return <span className="inline-flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700">✓ {lang === 'ha' ? 'An gama' : 'Completed'}</span>;
  return <Button disabled={pending} onClick={() => start(async () => setDone(await completeLesson(cohortId, lessonId)))}>{pending ? '…' : lang === 'ha' ? 'Na gama wannan darasin' : 'Mark as complete'}</Button>;
}

interface Question { id: string; kind: 'single' | 'multiple' | 'true_false'; prompt: string; prompt_ha: string | null; options: { id: string; text: string; text_ha?: string | null }[]; points: number }
interface Attempt { score: number; max_score: number; percent: number; passed: boolean; submitted_at: string }
interface Review { question_id: string; correct: string[]; explanation: string | null }

// Answers are kept on the device until the server confirms them, with a fixed id, so a dropped
// connection never loses or doubles an attempt: they are sent again when the phone is back online.
export function QuizPlayer({ cohortId, lessonId, questions, attempts, maxAttempts, passMark, review, lang }: {
  cohortId: string; lessonId: string; questions: Question[]; attempts: Attempt[]; maxAttempts: number | null; passMark: number; review: Review[]; lang: Lang;
}) {
  const key = `talentral:quiz:${lessonId}`;
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [queued, setQueued] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const used = attempts.length;
  const best = attempts.reduce((b, a) => Math.max(b, Number(a.percent)), 0);
  const passed = attempts.some((a) => a.passed);
  const left = maxAttempts === null ? null : maxAttempts - used;
  const reviewed = new Map(review.map((r) => [r.question_id, r]));

  async function send(payload: { clientId: string; answers: Record<string, string[]> }) {
    try {
      const r = await submitQuiz(cohortId, lessonId, payload.answers, payload.clientId);
      try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
      setQueued(false);
      setResult(r);
      if (r.ok) { setAnswers({}); router.refresh(); }
    } catch {
      // Offline or the server could not be reached: keep it on the device and send it (with the
      // same id, so it counts once) as soon as the connection is back.
      setQueued(true);
      window.addEventListener('online', () => { void send(payload); }, { once: true });
    }
  }

  useEffect(() => {
    let saved: { clientId: string; answers: Record<string, string[]> } | null = null;
    try { saved = JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { /* ignore */ }
    if (!saved) return;
    setQueued(true);
    const retry = () => { void send(saved!); };
    if (navigator.onLine) retry();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (q: Question, id: string) => setAnswers((a) => ({ ...a, [q.id]: q.kind === 'multiple' ? ((a[q.id] ?? []).includes(id) ? (a[q.id] ?? []).filter((x) => x !== id) : [...(a[q.id] ?? []), id]) : [id] }));
  const answered = questions.filter((q) => (answers[q.id] ?? []).length > 0).length;
  const canTry = !passed && (left === null || left > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="blue">{questions.length} {t('questions', 'tambayoyi')}</Badge>
        <Badge tone="neutral">{t('Pass mark', 'Makin wucewa')} {passMark}%</Badge>
        {maxAttempts !== null && <Badge tone="neutral">{t(`${Math.max(0, left ?? 0)} of ${maxAttempts} attempts left`, `Sauran dama ${Math.max(0, left ?? 0)} cikin ${maxAttempts}`)}</Badge>}
        {used > 0 && <Badge tone={passed ? 'teal' : 'amber'}>{t('Best', 'Mafi kyau')} {best}%</Badge>}
      </div>
      {queued && <Alert tone="amber">{t('Your answers are saved on this phone. We will send them as soon as you are back online.', 'An ajiye amsoshinka a wayar nan. Za a aika da su da zarar ka dawo kan intanet.')}</Alert>}
      {result && result.ok && (
        <div role="status" className={cx('rounded-2xl border p-5', result.passed ? 'border-teal-700/25 bg-teal-50' : 'border-amber-800/25 bg-amber-50')}>
          <p className={cx('font-display text-2xl font-semibold', result.passed ? 'text-teal-700' : 'text-amber-800')}>{result.percent}% · {result.passed ? t('Passed', 'Ka wuce') : t('Not yet', 'Ba ka wuce ba tukuna')}</p>
          <p className="mt-1 text-sm">{t(`You scored ${result.score} of ${result.max} points.`, `Ka samu maki ${result.score} cikin ${result.max}.`)} {!result.passed && canTry ? t('Review the lesson and try again.', 'Sake duba darasin ka gwada kuma.') : ''}</p>
        </div>
      )}
      {result && !result.ok && <Alert tone="danger">{result.message}</Alert>}

      {(canTry || review.length > 0) && (
        <ol className="space-y-4">
          {questions.map((q, i) => {
            const r = reviewed.get(q.id);
            return (
              <li key={q.id} className="rounded-2xl border border-line bg-white p-5">
                <fieldset>
                  <legend className="font-semibold">{i + 1}. {pick(q.prompt, q.prompt_ha, lang).text}</legend>
                  <p className="mt-0.5 text-xs text-muted">{q.kind === 'multiple' ? t('Choose all that apply', 'Zaɓi duk waɗanda suka dace') : t('Choose one', 'Zaɓi ɗaya')} · {q.points} {q.points === 1 ? t('point', 'maki') : t('points', 'maki')}</p>
                  <div className="mt-3 space-y-2">
                    {q.options.map((o) => {
                      const chosen = (answers[q.id] ?? []).includes(o.id);
                      const right = r?.correct.includes(o.id);
                      return (
                        <label key={o.id} className={cx('flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-[15px] transition',
                          r ? (right ? 'border-teal-700/40 bg-teal-50' : 'border-line') : chosen ? 'border-blue bg-blue-50' : 'border-line hover:border-blue/40')}>
                          <input type={q.kind === 'multiple' ? 'checkbox' : 'radio'} name={`q-${q.id}`} checked={chosen} disabled={!canTry} onChange={() => toggle(q, o.id)} className="size-4 accent-[var(--color-blue)]" />
                          <span className="flex-1">{pick(o.text, o.text_ha, lang).text}</span>
                          {r && right && <span className="text-xs font-bold text-teal-700">✓ {t('Right answer', 'Amsa daidai')}</span>}
                        </label>
                      );
                    })}
                  </div>
                  {r?.explanation && <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-sm text-muted">{r.explanation}</p>}
                </fieldset>
              </li>
            );
          })}
        </ol>
      )}
      {canTry && (
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={pending || answered < questions.length} onClick={() => start(async () => {
            const payload = { clientId: crypto.randomUUID(), answers };
            try { localStorage.setItem(key, JSON.stringify(payload)); } catch { /* storage unavailable */ }
            await send(payload);
          })}>{pending ? t('Marking…', 'Ana dubawa…') : t('Submit answers', 'Aika amsoshi')}</Button>
          <span className="text-sm text-muted">{answered}/{questions.length} {t('answered', 'an amsa')}</span>
        </div>
      )}
      {!canTry && !passed && <Alert tone="neutral">{t('You have used all your attempts. Your best score counts.', 'Ka yi amfani da duk damarka. Mafi kyawun makinka ne zai ƙidaya.')}</Alert>}
    </div>
  );
}

interface Submission { id: string; attempt: number; body: string | null; url: string | null; file_name: string | null; status: 'submitted' | 'graded' | 'resubmit'; score: number | null; feedback: string | null; submitted_at: string; graded_at: string | null }

export function AssignmentPanel({ cohortId, lessonId, types, submissions, lang }: { cohortId: string; lessonId: string; types: string[]; submissions: Submission[]; lang: Lang }) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitAssignment.bind(null, cohortId, lessonId), {});
  const [busy, setBusy] = useState(false);
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const last = submissions.at(-1);
  const canSubmit = !state.ok && (!last || last.status === 'resubmit');
  const e = state.errors ?? {};
  return (
    <div className="space-y-4">
      {submissions.length > 0 && (
        <ol className="space-y-3" aria-label={t('Your work', 'Aikinka')}>
          {submissions.map((s) => (
            <li key={s.id} className="rounded-2xl border border-line bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{t('Attempt', 'Yunƙuri')} {s.attempt} · {formatDate(s.submitted_at, true)}</p>
                <Badge tone={s.status === 'graded' ? 'teal' : s.status === 'resubmit' ? 'amber' : 'blue'}>
                  {s.status === 'graded' ? `${t('Graded', 'An duba')}${s.score !== null ? ` · ${Number(s.score)}%` : ''}` : s.status === 'resubmit' ? t('Please try again', 'Da fatan a sake') : t('Waiting for grading', 'Ana jiran dubawa')}
                </Badge>
              </div>
              {s.body && <p className="mt-2 whitespace-pre-line text-muted">{s.body}</p>}
              {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-2 block break-all font-semibold text-blue hover:underline">{s.url}</a>}
              {s.file_name && <a href={`/learn/submission/${s.id}`} className="mt-2 inline-flex items-center gap-1 font-semibold text-blue hover:underline">📎 {s.file_name}</a>}
              {s.feedback && <div className="mt-3 rounded-lg border-l-4 border-violet bg-violet-50 px-3 py-2"><p className="text-xs font-bold uppercase tracking-[0.08em] text-violet">{t('Feedback', 'Ra’ayi')}</p><p className="mt-1 whitespace-pre-line">{s.feedback}</p></div>}
            </li>
          ))}
        </ol>
      )}
      {state.ok && <Alert tone="teal">{state.message}</Alert>}
      {canSubmit && (
        <form action={action} className="space-y-4 rounded-2xl border border-line bg-white p-5">
          <p className="font-semibold">{last ? t('Hand in again', 'Sake mika aiki') : t('Hand in your work', 'Mika aikinka')}</p>
          {state.message && !state.ok && <Alert tone="danger">{state.message}</Alert>}
          {types.includes('text') && <Field label={t('Your answer', 'Amsarka')} htmlFor="as-body"><Textarea id="as-body" name="body" rows={6} maxLength={20000} /></Field>}
          {types.includes('link') && <Field label={t('Link to your work', 'Hanyar zuwa aikinka')} htmlFor="as-url" error={e.url} hint="GitHub, Google Drive, a website you built…"><Input id="as-url" name="url" type="url" inputMode="url" placeholder="https://" /></Field>}
          {types.includes('file') && (
            <DirectUpload id="as-file" name="file" label={t('File', 'Fayil')} hint={SUBMISSION_FILES.label} accept={SUBMISSION_FILES.types} maxBytes={SUBMISSION_FILES.maxBytes}
              error={e.file} onBusy={setBusy} prepare={(n, ty, sz) => prepareSubmissionUpload(cohortId, lessonId, n, ty, sz)} />
          )}
          <Button type="submit" disabled={pending || busy}>{pending ? t('Sending…', 'Ana aikawa…') : busy ? t('Uploading…', 'Ana lodawa…') : t('Hand in', 'Mika')}</Button>
        </form>
      )}
    </div>
  );
}
