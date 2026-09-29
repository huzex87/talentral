'use client';
import { useState } from 'react';
import { Card, Input, cx } from '@/components/ui';
import { saveResult } from '../../../actions';

export interface GradeRow { enrolment_id: string; full_name: string; reference: string; score: string | null; feedback: string | null }
type State = 'idle' | 'saving' | 'saved' | 'error';

// Scores save when a field loses focus, one learner at a time, so nothing is lost on a weak connection.
export function Gradebook({ slug, assessmentId, max, rows }: { slug: string; assessmentId: string; max: number; rows: GradeRow[] }) {
  return (
    <Card className="divide-y divide-line">
      {rows.map((r) => <Row key={r.enrolment_id} slug={slug} assessmentId={assessmentId} max={max} row={r} />)}
    </Card>
  );
}

function Row({ slug, assessmentId, max, row }: { slug: string; assessmentId: string; max: number; row: GradeRow }) {
  const [score, setScore] = useState(row.score === null ? '' : String(Number(row.score)));
  const [feedback, setFeedback] = useState(row.feedback ?? '');
  const [saved, setSaved] = useState({ score, feedback });
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');

  const save = async () => {
    if (score === saved.score && feedback === saved.feedback) return;
    const n = score.trim() === '' ? null : Number(score);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > max)) { setState('error'); setMessage(`0 to ${max}`); return; }
    setState('saving');
    const r = await saveResult(slug, assessmentId, row.enrolment_id, n, feedback).catch(() => ({ ok: false, message: 'Not saved. Try again.' }));
    if (r.ok) { setSaved({ score, feedback }); setState('saved'); setMessage(''); } else { setState('error'); setMessage(r.message ?? 'Not saved.'); }
  };

  return (
    <div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_120px_minmax(0,1.3fr)] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-semibold">{row.full_name}</p>
        <p className="font-mono text-[12px] text-muted">{row.reference}</p>
      </div>
      <div className="flex items-center gap-2">
        <Input value={score} onChange={(e) => { setScore(e.target.value); setState('idle'); }} onBlur={save} inputMode="decimal" aria-label={`Score for ${row.full_name}`}
          className={cx('h-10 w-20 text-center font-semibold', state === 'error' && 'border-danger')} placeholder="–" />
        <span className="text-sm text-muted">/ {max}</span>
      </div>
      <div className="flex items-center gap-2">
        <Input value={feedback} onChange={(e) => { setFeedback(e.target.value); setState('idle'); }} onBlur={save} maxLength={1000} aria-label={`Feedback for ${row.full_name}`}
          className="h-10 text-sm" placeholder="Feedback (optional)" />
        <span className={cx('w-14 shrink-0 text-xs font-semibold', state === 'saved' ? 'text-teal-700' : state === 'error' ? 'text-danger' : 'text-muted')} aria-live="polite">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? '✓ Saved' : state === 'error' ? message : ''}
        </span>
      </div>
    </div>
  );
}
