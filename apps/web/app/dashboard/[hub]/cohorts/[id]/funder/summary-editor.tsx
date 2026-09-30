'use client';
import { useActionState } from 'react';
import { AiDraft, DraftText, fillField } from '@/components/ai-draft';
import { Alert, Button, Textarea } from '@/components/ui';
import { keepValues } from '@/lib/keep-values';
import { saveFunderSummary, type FormState } from '../../actions';
import { aiFunderSummary } from '../../../ai-actions';

// The executive summary that opens the report: written by the hub, optionally drafted by Claude
// from this report's figures, and saved only when the hub presses Save.
export function SummaryEditor({ slug, cohortId, summary, ai }: { slug: string; cohortId: string; summary: string | null; ai: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveFunderSummary.bind(null, slug, cohortId), {});
  return (
    <form onSubmit={keepValues(action)} className="space-y-3">
      <div>
        <label htmlFor="fs-summary" className="block font-semibold">Executive summary</label>
        <p className="mt-0.5 text-sm text-muted">Opens the report. Say what the cohort set out to do, what it achieved and what comes next, in your own words.</p>
      </div>
      {ai && (
        <AiDraft label="Draft with AI" title="Draft the executive summary"
          intro="Claude writes from this report’s figures only: totals and percentages, never a learner’s name. Add context the figures cannot show."
          notesLabel="Context for Claude" notesPlaceholder="For example: classes moved online for two weeks in August because of flooding. Next: placement drive with three Katsina employers in November."
          run={(notes) => aiFunderSummary(slug, cohortId, notes)}
          preview={(d) => <DraftText text={d.summary} />}
          useLabel="Use this summary"
          apply={(d) => { fillField('fs-summary', d.summary); return 'Summary filled in. Check every figure, then save.'; }} />
      )}
      <Textarea id="fs-summary" name="summary" rows={7} maxLength={4000} defaultValue={summary ?? ''} className="text-[15px] leading-relaxed" />
      {state.message && <Alert tone={state.ok ? 'teal' : 'danger'}>{state.message}</Alert>}
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? 'Saving…' : 'Save summary'}</Button>
    </form>
  );
}
