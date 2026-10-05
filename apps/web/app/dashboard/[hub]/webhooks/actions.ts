'use server';
// Outbound webhooks (MVP-2 month 11): owners and admins add endpoints that receive their hub's
// events, signed with a secret. Delivery and retries live in lib/webhooks.ts.
import { revalidatePath } from 'next/cache';
import { withUser } from '@talentral/db';
import { isWebhookEvent, webhookUrlProblem } from '@talentral/domain';
import { requireHubRole } from '@/lib/auth';
import { allowPrivateWebhooks, deliverWebhooks } from '@/lib/webhooks';

export interface WebhookState { ok?: boolean; message?: string; errors?: Record<string, string> }

export async function addWebhook(slug: string, _prev: WebhookState, form: FormData): Promise<WebhookState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const url = String(form.get('url') ?? '').trim();
  const description = String(form.get('description') ?? '').trim().slice(0, 120);
  const events = form.getAll('events').map(String).filter(isWebhookEvent);
  const errors: Record<string, string> = {};
  const problem = webhookUrlProblem(url, allowPrivateWebhooks());
  if (problem) errors.url = problem;
  if (!events.length) errors.events = 'Choose at least one event.';
  if (Object.keys(errors).length) return { errors };
  try {
    await withUser(user.id, (tx) => tx`select app.add_webhook(${hub.id}, ${url}, ${description}, ${events})`);
  } catch (e) {
    return { message: /up to 10/.test(e instanceof Error ? e.message : '') ? 'A hub can have up to 10 endpoints. Remove one first.' : 'We could not add the endpoint. Please try again.' };
  }
  revalidatePath(`/dashboard/${slug}/webhooks`);
  return { ok: true, message: 'Endpoint added. Copy its signing secret into your receiver.' };
}

export async function changeWebhook(slug: string, id: string, action: 'pause' | 'resume' | 'roll' | 'delete'): Promise<void> {
  const { user } = await requireHubRole(slug, ['owner', 'admin']);
  await withUser(user.id, (tx) => tx`select app.change_webhook(${id}, ${action})`);
  revalidatePath(`/dashboard/${slug}/webhooks`);
}

// Sends a test event now (or a fresh copy of an earlier delivery) and reports what happened.
export async function sendWebhookTest(slug: string, id: string, redeliver: string | null = null): Promise<WebhookState> {
  const { user } = await requireHubRole(slug, ['owner', 'admin']);
  const [row] = await withUser(user.id, (tx) => tx<{ id: string | null }[]>`select app.queue_webhook_test(${id}, ${redeliver}) as id`);
  if (!row?.id) return { message: 'We could not find that endpoint.' };
  await deliverWebhooks({ ids: [row.id] });
  const [d] = await withUser(user.id, (tx) => tx<{ status: string; last_status: number | null; last_error: string | null }[]>`
    select status, last_status, last_error from webhook_deliveries where id = ${row.id}`);
  revalidatePath(`/dashboard/${slug}/webhooks`);
  return d?.status === 'delivered'
    ? { ok: true, message: `Delivered. Your endpoint answered ${d.last_status}.` }
    : { message: `${d?.last_error ?? 'Not delivered.'} We will retry automatically.` };
}
