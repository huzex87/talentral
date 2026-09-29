'use client';
import { useActionState } from 'react';
import { Alert, Field, Input, Select } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { invite, type TeamState } from './actions';

export function InviteForm({ slug, canInviteOwner }: { slug: string; canInviteOwner: boolean }) {
  const [state, action] = useActionState<TeamState, FormData>(invite.bind(null, slug), {});
  return (
    <form action={action} className="space-y-4">
      {state.message && <Alert tone={state.ok ? 'teal' : 'danger'}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <Field label="Email address" htmlFor="invite-email"><Input id="invite-email" name="email" type="email" required placeholder="colleague@yourhub.ng" /></Field>
        <Field label="Role" htmlFor="invite-role">
          <Select id="invite-role" name="role" defaultValue="reviewer">
            <option value="reviewer">Reviewer</option>
            <option value="admin">Admin</option>
            {canInviteOwner && <option value="owner">Owner</option>}
          </Select>
        </Field>
        <SubmitButton pendingLabel="Sending…">Send invitation</SubmitButton>
      </div>
    </form>
  );
}
