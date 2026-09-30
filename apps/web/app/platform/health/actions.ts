'use server';
import { revalidatePath } from 'next/cache';
import { withUser } from '@talentral/db';
import { requirePlatformAdmin } from '@/lib/auth';

export interface IncidentState { ok?: boolean; message?: string }
const UUID = /^[0-9a-f-]{36}$/;

export async function recordIncident(_prev: IncidentState, form: FormData): Promise<IncidentState> {
  const admin = await requirePlatformAdmin();
  const occurred = String(form.get('occurred_on') ?? '');
  const summary = String(form.get('summary') ?? '').trim().slice(0, 2000);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurred)) return { message: 'Give the date it happened.' };
  if (summary.length < 10) return { message: 'Describe what happened in at least 10 characters.' };
  try {
    await withUser(admin.id, (tx) => tx`select app.record_incident(${occurred}::date, ${summary}, ${form.get('cross_tenant') === 'on'}, ${form.get('personal_data') === 'on'})`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    return { message: /date it happened/.test(msg) ? 'The date cannot be in the future.' : 'We could not record it. Please try again.' };
  }
  revalidatePath('/platform/health');
  return { ok: true, message: 'Incident recorded and added to the audit log.' };
}

export async function updateIncident(id: string, step: 'notified' | 'resolved') {
  const admin = await requirePlatformAdmin();
  if (!UUID.test(id) || (step !== 'notified' && step !== 'resolved')) return;
  await withUser(admin.id, (tx) => tx`select app.update_incident(${id}, ${step})`);
  revalidatePath('/platform/health');
}
