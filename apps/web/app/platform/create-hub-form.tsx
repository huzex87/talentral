'use client';
import { useActionState, useState } from 'react';
import { slugify } from '@talentral/domain';
import { Alert, Field, Input } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { createHub, type CreateHubState } from './actions';

export function CreateHubForm({ rootDomain }: { rootDomain: string | null }) {
  const [state, action] = useActionState<CreateHubState, FormData>(createHub, {});
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const e = state.errors ?? {};
  const shown = touched ? slug : slugify(name);
  return (
    <form action={action} className="space-y-4" key={state.ok ? state.message : 'form'}>
      {state.message && <Alert tone={state.ok ? 'teal' : 'danger'}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Hub name" htmlFor="name" error={e.name}><Input id="name" name="name" value={name} onChange={(ev) => setName(ev.target.value)} required /></Field>
        <Field label="Web address" htmlFor="slug" hint={rootDomain ? `${shown || 'hub'}.${rootDomain}` : `/${shown || 'hub'}`} error={e.slug}>
          <Input id="slug" name="slug" value={shown} onChange={(ev) => { setTouched(true); setSlug(ev.target.value.toLowerCase()); }} className="font-mono" />
        </Field>
      </div>
      <Field label="Owner's email" htmlFor="owner_email" hint="They receive an invitation and complete the hub profile themselves." error={e.owner_email}>
        <Input id="owner_email" name="owner_email" type="email" required />
      </Field>
      <SubmitButton pendingLabel="Creating…">Create hub and invite owner</SubmitButton>
    </form>
  );
}
