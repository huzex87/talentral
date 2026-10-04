'use client';
import { useActionState } from 'react';
import type { Programme } from '@talentral/db';
import { Alert, Field, Input, Textarea } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { AiDraft, DraftText, fillField, readField } from '@/components/ai-draft';
import { saveDetails, type ProgState } from '../actions';
import { aiProgramme } from '../../ai-actions';

export function DetailsForm({ slug, programme: p, opens, closes, publicUrl, ai = false }: { slug: string; programme: Programme; opens: string; closes: string; publicUrl: string; ai?: boolean }) {
  const [state, action] = useActionState<ProgState, FormData>(saveDetails.bind(null, slug, p.id), {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-5">
      {state.message && <Alert tone={state.ok ? 'teal' : 'danger'}>{state.message}{state.ok && <> <a href={publicUrl} target="_blank" className="font-semibold underline">Preview the page ↗</a></>}</Alert>}
      <Field label="Title" htmlFor="title" required error={e.title}><Input id="title" name="title" defaultValue={p.title} /></Field>
      <Field label="Web address" htmlFor="slug" hint={<>Public page: <span className="font-mono">{publicUrl}</span></>} error={e.slug}>
        <Input id="slug" name="slug" defaultValue={p.slug} className="font-mono" />
      </Field>
      {ai && (
        <AiDraft title="Draft the summary and description"
          intro="Claude writes from your notes, the title, tracks and who can apply. Anything already in the description is improved rather than replaced."
          notesLabel="Notes for Claude" notesPlaceholder={'Who it is for, what they learn, how long it runs, where, who supports it. Rough notes are fine.\nFor example: 12 weeks, three days a week at the hub, for 18 to 35 year olds in Katsina, laptops provided.'}
          run={(notes) => aiProgramme(slug, p.id, notes, readField('description'))}
          preview={(d) => (<>
            <p className="text-[13px] font-medium text-muted">Summary</p>
            <p className="mt-1 font-semibold">{d.summary}</p>
            <p className="mt-4 text-[13px] font-medium text-muted">Description</p>
            <DraftText text={d.description} className="mt-1" />
          </>)}
          useLabel="Use both"
          apply={(d) => { fillField('summary', d.summary); fillField('description', d.description); return 'Summary and description filled in. Review them, then save.'; }} />
      )}
      <Field label="Summary" htmlFor="summary" required hint="One or two sentences shown on your hub page." error={e.summary}><Input id="summary" name="summary" maxLength={300} defaultValue={p.summary ?? ''} /></Field>
      <Field label="Description" htmlFor="description" hint="What the programme offers, how long it runs, where and how it is delivered." error={e.description}>
        <Textarea id="description" name="description" rows={7} maxLength={8000} defaultValue={p.description ?? ''} />
      </Field>
      <Field label="Who can apply" htmlFor="eligibility" error={e.eligibility}><Textarea id="eligibility" name="eligibility" rows={4} maxLength={3000} defaultValue={p.eligibility ?? ''} /></Field>
      <Field label="Tracks (one per line)" htmlFor="tracks" hint="Leave empty if the programme has a single track. Applicants choose one." error={e.tracks}>
        <Textarea id="tracks" name="tracks" rows={4} defaultValue={p.tracks.join('\n')} placeholder={'Digital Marketing\nSoftware Development\nCreative Design'} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Opens (WAT)" htmlFor="opens_at" hint="Optional" error={e.opens_at}><Input id="opens_at" name="opens_at" type="datetime-local" defaultValue={opens} /></Field>
        <Field label="Closes (WAT)" htmlFor="closes_at" hint="Recommended" error={e.closes_at}><Input id="closes_at" name="closes_at" type="datetime-local" defaultValue={closes} /></Field>
        <Field label="Places" htmlFor="capacity" hint="Optional" error={e.capacity}><Input id="capacity" name="capacity" inputMode="numeric" defaultValue={p.capacity ?? ''} /></Field>
      </div>
      <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
    </form>
  );
}
