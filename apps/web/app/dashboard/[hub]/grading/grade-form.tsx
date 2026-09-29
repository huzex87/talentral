'use client';
import { useActionState } from 'react';
import { Alert, Button, Field, Input, Textarea } from '@/components/ui';
import { gradeSubmission, type GradeState } from './actions';

export function GradeForm({ slug, submissionId, name }: { slug: string; submissionId: string; name: string }) {
  const [graded, grade, gPending] = useActionState<GradeState, FormData>(gradeSubmission.bind(null, slug, submissionId, 'graded'), {});
  const [sent, resubmit, rPending] = useActionState<GradeState, FormData>(gradeSubmission.bind(null, slug, submissionId, 'resubmit'), {});
  const done = graded.ok ? graded : sent.ok ? sent : null;
  if (done) return <Alert tone="teal">{done.message}</Alert>;
  const error = graded.message ?? sent.message;
  return (
    <form className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
        <Field label="Score (%)" htmlFor={`sc-${submissionId}`}><Input id={`sc-${submissionId}`} name="score" inputMode="decimal" aria-label={`Score for ${name}`} placeholder="0 to 100" /></Field>
        <Field label="Feedback" htmlFor={`fb-${submissionId}`}><Textarea id={`fb-${submissionId}`} name="feedback" rows={2} aria-label={`Feedback for ${name}`} placeholder="What was good, and what to improve" /></Field>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" formAction={grade} disabled={gPending || rPending}>{gPending ? 'Saving…' : 'Save grade'}</Button>
        <Button type="submit" size="sm" variant="secondary" formAction={resubmit} disabled={gPending || rPending}>{rPending ? 'Sending…' : 'Ask to try again'}</Button>
      </div>
    </form>
  );
}
