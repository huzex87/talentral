'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { cancelRequest, createRequest } from '@/lib/privacy';

export interface RequestState { ok?: boolean; message?: string }

export async function askToCorrect(_prev: RequestState, form: FormData): Promise<RequestState> {
  const user = await requireUser();
  const details = String(form.get('details') ?? '').trim().slice(0, 2000);
  const r = await createRequest(user, 'correction', details);
  if (!r.ok) return { message: r.message };
  revalidatePath('/account/privacy');
  return { ok: true, message: 'Request sent. We have emailed you a receipt and will reply within 30 days.' };
}

export async function askToDelete(_prev: RequestState, form: FormData): Promise<RequestState> {
  const user = await requireUser();
  if (String(form.get('confirm') ?? '').trim().toUpperCase() !== 'DELETE') return { message: 'Type DELETE to confirm.' };
  const r = await createRequest(user, 'erasure', String(form.get('reason') ?? '').trim().slice(0, 2000));
  if (!r.ok) return { message: r.message };
  revalidatePath('/account/privacy');
  return { ok: true, message: 'Request sent. We have emailed you a receipt. You can still cancel it below until we carry it out.' };
}

export async function cancel(id: string): Promise<void> {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await cancelRequest(user.id, id);
  revalidatePath('/account/privacy');
}
