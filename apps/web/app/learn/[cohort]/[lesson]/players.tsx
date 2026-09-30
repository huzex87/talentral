'use client';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { SUBMISSION_FILES, averageMarks, criterionMax, levelFor, pick, rubricPercent, sortLevels, type RubricCriterion } from '@talentral/domain';
import { DirectUpload } from '@/components/direct-upload';
import { Alert, Badge, Button, Field, Input, Textarea, cx } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { isQueued, queueProgress } from '@/lib/offline';
import { completeLesson, prepareSubmissionUpload, submitAssignment, submitPeerReview, submitQuiz, type PeerState, type QuizResult, type SubmitState } from '../../actions';

type Lang = 'en' | 'ha';

// Marks a reading, video, audio or PDF lesson as done. Offline, it is saved on the phone and sent
// when the connection is back (see PwaSetup).
export function CompleteButton({ cohortId, lessonId, done, lang }: { cohortId: string; lessonId: string; done: boolean; lang: Lang }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<'todo' | 'done' | 'queued'>(done ? 'done' : 'todo');
  useEffect(() => { if (!done && isQueued(lessonId)) setState('queued'); }, [done, lessonId]);
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  if (state === 'done') return <span className="inline-flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700">✓ {t('Completed', 'An gama')}</span>;
  if (state === 'queued') return <span className="inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">✓ {t('Saved on this phone', 'An ajiye a wayar nan')}</span>;
  return (
    <Button disabled={pending} onClick={() => start(async () => {
      try {
        setState((await completeLesson(cohortId, lessonId)) ? 'done' : 'todo');
      } catch {
        queueProgress({ cohortId, lessonId });
        setState('queued');
      }
    })}>{pending ? '…' : t('Mark as complete', 'Na gama wannan darasin')}</Button>
  );
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

interface Submission {
  id: string; attempt: number; body: string | null; url: string | null; file_name: string | null; status: 'submitted' | 'graded' | 'resubmit'; score: number | null; feedback: string | null;
  submitted_at: string; graded_at: string | null; marks?: Record<string, { points: number; comment: string | null }>; peer?: { marks: Record<string, number>; comment: string | null; at: string }[];
}

export function AssignmentPanel({ cohortId, lessonId, types, submissions, lang, rubric = [] }: { cohortId: string; lessonId: string; types: string[]; submissions: Submission[]; lang: Lang; rubric?: RubricCriterion[] }) {
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
              {rubric.length > 0 && s.marks && Object.keys(s.marks).length > 0 && <MarksBreakdown rubric={rubric} marks={s.marks} lang={lang} />}
              {s.peer && s.peer.length > 0 && <PeerFeedback rubric={rubric} reviews={s.peer} lang={lang} />}
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
          {types.includes('link') && <Field label={t('Link to your work', 'Hanyar zuwa aikinka')} htmlFor="as-url" error={e.url} hint={t('GitHub, Google Drive, a website you built…', 'GitHub, Google Drive, shafin da ka gina…')}><Input id="as-url" name="url" type="url" inputMode="url" placeholder="https://" /></Field>}
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

// How a grade was reached: the level for each criterion, with the grader's comment.
function MarksBreakdown({ rubric, marks, lang }: { rubric: RubricCriterion[]; marks: Record<string, { points: number; comment: string | null }>; lang: Lang }) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  return (
    <div className="mt-3 rounded-lg border border-line">
      <p className="border-b border-line px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-muted">{t('Marks by criterion', 'Maki bisa ma’auni')}</p>
      <ul className="divide-y divide-line">
        {rubric.map((c) => {
          const m = marks[c.id];
          const level = m ? levelFor(c, Number(m.points)) : null;
          return (
            <li key={c.id} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{pick(c.title, c.title_ha, lang).text}</span>
                <span className="shrink-0 text-xs font-bold text-blue">{level ? `${pick(level.label, level.label_ha, lang).text} · ${Number(m!.points)}/${criterionMax(c.levels)}` : '–'}</span>
              </div>
              {m?.comment && <p className="mt-0.5 text-muted">{m.comment}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// What classmates said, anonymously.
function PeerFeedback({ rubric, reviews, lang }: { rubric: RubricCriterion[]; reviews: { marks: Record<string, number>; comment: string | null }[]; lang: Lang }) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const avg = averageMarks(reviews);
  return (
    <div className="mt-3 rounded-lg border border-violet/20 bg-violet-50/40 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-violet">👥 {t(`Feedback from ${reviews.length} classmate${reviews.length === 1 ? '' : 's'}`, `Ra’ayoyin abokan karatu ${reviews.length}`)}</p>
      {rubric.length > 0 && Object.keys(avg).length > 0 && (
        <p className="mt-1 text-xs text-muted">{t('Average', 'Matsakaici')}: {rubric.map((c) => `${pick(c.title, c.title_ha, lang).text} ${avg[c.id] ?? '–'}/${criterionMax(c.levels)}`).join(' · ')}</p>
      )}
      <ul className="mt-2 space-y-1.5">{reviews.map((r, i) => r.comment && <li key={i} className="rounded-md bg-white px-2.5 py-1.5">“{r.comment}”</li>)}</ul>
      <p className="mt-2 text-xs text-muted">{t('Peer feedback helps you improve. It does not change your grade.', 'Ra’ayoyin abokan karatu suna taimaka maka ka inganta. Ba sa canza makinka.')}</p>
    </div>
  );
}

// The rubric, shown before a learner hands in so they know how their work will be marked.
export function RubricGuide({ rubric, lang }: { rubric: RubricCriterion[]; lang: Lang }) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  if (!rubric.length) return null;
  const total = rubric.reduce((s, c) => s + criterionMax(c.levels), 0);
  return (
    <details className="rounded-2xl border border-line bg-white p-4" open>
      <summary className="cursor-pointer font-semibold">📋 {t('How your work will be marked', 'Yadda za a duba aikinka')} <span className="text-sm font-normal text-muted">· {t(`${total} points`, `maki ${total}`)}</span></summary>
      <ol className="mt-3 space-y-3">
        {rubric.map((c) => (
          <li key={c.id} className="text-sm">
            <p className="font-semibold">{pick(c.title, c.title_ha, lang).text}</p>
            {c.description && <p className="text-muted">{pick(c.description, c.description_ha, lang).text}</p>}
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {sortLevels(c.levels).map((l) => <li key={l.points} className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold">{pick(l.label, l.label_ha, lang).text} · {l.points}</li>)}
            </ul>
          </li>
        ))}
      </ol>
    </details>
  );
}

export interface PeerTask { review_id: string; submission_id: string; body: string | null; url: string | null; file_name: string | null; completed: boolean; marks: Record<string, number>; comment: string | null }

// Classmates' work to review, anonymously, after handing in.
export function PeerReviewTasks({ tasks, rubric, lang }: { tasks: PeerTask[]; rubric: RubricCriterion[]; lang: Lang }) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const left = tasks.filter((x) => !x.completed).length;
  return (
    <section aria-label={t('Peer review', 'Duba aikin abokan karatu')} className="space-y-3 rounded-2xl border border-violet/25 bg-violet-50/30 p-4 sm:p-5">
      <div>
        <h2 className="font-display text-lg font-semibold">👥 {t('Review your classmates', 'Duba aikin abokan karatunka')}</h2>
        <p className="text-sm text-muted">
          {tasks.length === 0
            ? t('No classmates have handed in yet. Check back later.', 'Babu abokin karatu da ya mika aiki tukuna. Dawo daga baya.')
            : left
              ? t(`${left} to review. Names are hidden both ways: be honest and kind.`, `Guda ${left} da za ka duba. Ba a nuna sunaye ba: ka faɗi gaskiya cikin ladabi.`)
              : t('All done. Thank you for helping your classmates.', 'An gama. Na gode da taimakon abokan karatunka.')}
        </p>
      </div>
      {tasks.map((task, i) => <PeerTaskCard key={task.review_id} task={task} index={i} rubric={rubric} lang={lang} />)}
    </section>
  );
}

function PeerTaskCard({ task, index, rubric, lang }: { task: PeerTask; index: number; rubric: RubricCriterion[]; lang: Lang }) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const [marks, setMarks] = useState<Record<string, number>>(task.marks ?? {});
  const [state, action, pending] = useActionState<PeerState, FormData>(submitPeerReview.bind(null, task.review_id), {});
  const done = task.completed || state.ok;
  return (
    <article className="rounded-xl border border-line bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted">{t(`Classmate ${index + 1}`, `Abokin karatu ${index + 1}`)}{done ? ` · ✓ ${t('reviewed', 'an duba')}` : ''}</p>
      <div className="mt-2 space-y-1.5 rounded-lg bg-canvas/70 p-3 text-sm">
        {task.body && <p className="whitespace-pre-line">{task.body}</p>}
        {task.url && <a href={task.url} target="_blank" rel="noopener noreferrer nofollow" className="block break-all font-semibold text-blue hover:underline">{task.url} ↗</a>}
        {task.file_name && <a href={`/learn/submission/${task.submission_id}`} className="inline-flex items-center gap-1 font-semibold text-blue hover:underline">📎 {task.file_name}</a>}
      </div>
      {done ? (
        <p className="mt-3 text-sm text-teal-700">✓ {t('Thank you. Your review has been sent anonymously.', 'Na gode. An aika da ra’ayinka ba tare da sunanka ba.')}</p>
      ) : (
        <form action={action} className="mt-3 space-y-3">
          <input type="hidden" name="marks" value={JSON.stringify(marks)} />
          {rubric.map((c) => (
            <fieldset key={c.id}>
              <legend className="text-sm font-semibold">{pick(c.title, c.title_ha, lang).text}</legend>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {sortLevels(c.levels).map((l) => (
                  <label key={l.points} className="cursor-pointer">
                    <input type="radio" name={`peer_${task.review_id}_${c.id}`} className="peer sr-only" checked={marks[c.id] === l.points} onChange={() => setMarks({ ...marks, [c.id]: l.points })} />
                    <span className="inline-flex rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-muted transition peer-checked:border-violet peer-checked:bg-violet peer-checked:text-white">{pick(l.label, l.label_ha, lang).text}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <Field label={t('Your comment', 'Ra’ayinka')} htmlFor={`peer-comment-${task.review_id}`} hint={t('One thing done well, and one thing to improve.', 'Abu ɗaya da aka yi da kyau, da abu ɗaya da za a inganta.')}>
            <Textarea id={`peer-comment-${task.review_id}`} name="comment" rows={3} maxLength={2000} required />
          </Field>
          {state.message && <Alert tone="danger">{state.message}</Alert>}
          <Button type="submit" size="sm" disabled={pending || (rubric.length > 0 && rubricPercent(rubric, marks) === null)}>{pending ? t('Sending…', 'Ana aikawa…') : t('Send review', 'Aika ra’ayi')}</Button>
        </form>
      )}
    </article>
  );
}
