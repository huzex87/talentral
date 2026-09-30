'use server';
import { requirePlatformAdmin } from '@/lib/auth';
import { closeRequest, eraseForRequest } from '@/lib/privacy';

// No page refresh after an action: each card keeps its confirmation, and the list updates on the next visit.
export interface QueueState { ok?: boolean; message?: string }
const UUID = /^[0-9a-f-]{36}$/;

export async function carryOutErasure(id: string, _prev: QueueState, form: FormData): Promise<QueueState> {
  const admin = await requirePlatformAdmin();
  if (!UUID.test(id)) return { message: 'Something went wrong. Reload the page.' };
  if (String(form.get('confirm') ?? '').trim().toUpperCase() !== 'DELETE') return { message: 'Type DELETE to confirm.' };
  const r = await eraseForRequest(admin.id, id);
  if (!r.ok) return { message: r.message };
  return { ok: true, message: `Deleted. ${r.files} ${r.files === 1 ? 'file' : 'files'} removed from storage, and the person has been emailed.` };
}

export async function closeWith(id: string, status: 'completed' | 'declined', _prev: QueueState, form: FormData): Promise<QueueState> {
  const admin = await requirePlatformAdmin();
  if (!UUID.test(id)) return { message: 'Something went wrong. Reload the page.' };
  const outcome = String(form.get('outcome') ?? '').trim().slice(0, 2000);
  if (outcome.length < 5) return { message: status === 'declined' ? 'Say why, so the person understands.' : 'Say what you changed.' };
  await closeRequest(admin.id, id, status, outcome);
  return { ok: true, message: status === 'completed' ? 'Marked done and the person has been emailed.' : 'Declined and the person has been emailed.' };
}
