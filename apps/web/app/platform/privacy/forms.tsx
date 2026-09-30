'use client';
import { useActionState } from 'react';
import { Alert, Input } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { carryOutErasure, closeWith, type QueueState } from './actions';

export function EraseForm({ id }: { id: string }) {
  const [state, action] = useActionState<QueueState, FormData>(carryOutErasure.bind(null, id), {});
  if (state.ok) return <Alert tone="teal">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="text-sm"><span className="mb-1 block font-semibold">Type DELETE</span><Input name="confirm" autoComplete="off" aria-label={`Type DELETE to erase for request ${id.slice(0, 8)}`} className="h-9 w-32 font-mono uppercase" /></label>
      <SubmitButton size="sm" variant="danger" pendingLabel="Deleting…">Carry out deletion</SubmitButton>
      {state.message && <div className="basis-full"><Alert tone="danger">{state.message}</Alert></div>}
    </form>
  );
}

export function CloseForm({ id, status, label }: { id: string; status: 'completed' | 'declined'; label: string }) {
  const [state, action] = useActionState<QueueState, FormData>(closeWith.bind(null, id, status), {});
  if (state.ok) return <Alert tone="teal">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Input name="outcome" maxLength={2000} placeholder={status === 'declined' ? 'Why (the person sees this)' : 'What you changed (the person sees this)'} aria-label={`${label}: note`} className="h-9 min-w-56 flex-1 text-sm" />
      <SubmitButton size="sm" variant={status === 'declined' ? 'ghost' : 'secondary'} pendingLabel="Saving…">{label}</SubmitButton>
      {state.message && <div className="basis-full"><Alert tone="danger">{state.message}</Alert></div>}
    </form>
  );
}
