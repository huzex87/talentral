'use client';
import { useActionState, useTransition } from 'react';
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { keepValues } from '@/lib/keep-values';
import { deleteStory, publishStory, saveStory, unpublishStory, type StoryState } from './actions';

type Values = { title: string; slug: string; tenant_id: string; summary: string; body: string; metrics: string; quote: string; quote_by: string };

export function StoryForm({ id, hubs, initial }: { id: string | null; hubs: { id: string; name: string }[]; initial?: Values }) {
  const [state, action, pending] = useActionState<StoryState, FormData>(saveStory.bind(null, id), {});
  const e = state.errors ?? {};
  const v = (k: keyof Values) => state.values?.[k] ?? initial?.[k] ?? '';
  return (
    <form onSubmit={keepValues(action)} className="space-y-5">
      {state.message && <Alert tone={state.ok ? 'teal' : 'danger'} title={state.message} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="s-title" required error={e.title}><Input id="s-title" name="title" defaultValue={v('title')} maxLength={140} /></Field>
        <Field label="Hub" htmlFor="s-hub" hint="The founding hub the story is about.">
          <Select id="s-hub" name="tenant_id" defaultValue={v('tenant_id')}><option value="">No hub</option>{hubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select>
        </Field>
      </div>
      <Field label="Web address" htmlFor="s-slug" error={e.slug} hint="Leave empty to make one from the title. Appears as /stories/your-address.">
        <Input id="s-slug" name="slug" defaultValue={v('slug')} maxLength={80} placeholder="kirkira-idice-cohort-1" />
      </Field>
      <Field label="Summary" htmlFor="s-summary" required error={e.summary} hint="Two or three sentences shown on cards and at the top of the story.">
        <Textarea id="s-summary" name="summary" defaultValue={v('summary')} maxLength={400} className="min-h-20" />
      </Field>
      <Field label="Headline figures" htmlFor="s-metrics" error={e.metrics} hint={'One per line as "Label: value", up to four. Use only figures from the hub’s own reports.'}>
        <Textarea id="s-metrics" name="metrics" defaultValue={v('metrics')} className="min-h-24 font-mono text-[13px]" placeholder={'Learners completed: 84%\nWomen selected: 52%'} />
      </Field>
      <Field label="Story" htmlFor="s-body" error={e.body} hint="Headings with #, lists with -, **bold**. The same simple formatting as lessons.">
        <Textarea id="s-body" name="body" defaultValue={v('body')} className="min-h-72" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field label="Quote" htmlFor="s-quote" error={e.quote}><Textarea id="s-quote" name="quote" defaultValue={v('quote')} maxLength={500} className="min-h-20" /></Field>
        <Field label="Quote by" htmlFor="s-quote-by" error={e.quote_by} hint="Name and role."><Input id="s-quote-by" name="quote_by" defaultValue={v('quote_by')} maxLength={120} /></Field>
      </div>
      <Button type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Saving…' : id ? 'Save story' : 'Create draft'}</Button>
    </form>
  );
}

export function PublishStory({ id, published }: { id: string; published: boolean }) {
  const [state, action, pending] = useActionState<StoryState, FormData>(publishStory.bind(null, id), {});
  const [busy, start] = useTransition();
  if (published) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => start(() => unpublishStory(id))}>Unpublish</Button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <Field label="Hub’s agreement" htmlFor="s-consent" error={state.errors?.consent} hint="Who at the hub approved this text for publication, and when. Recorded in the audit log.">
          <Input id="s-consent" name="consent" maxLength={300} placeholder="Approved by Amina Yusuf (Programme lead), email of 3 Oct 2026" />
        </Field>
        <Button type="submit" disabled={pending} aria-busy={pending}>Publish</Button>
        {state.message && <p role="status" className="text-sm text-teal-700">{state.message}</p>}
      </form>
      <Button type="button" variant="danger" size="sm" disabled={busy} onClick={() => { if (confirm('Delete this draft?')) start(() => deleteStory(id)); }}>Delete draft</Button>
    </div>
  );
}
