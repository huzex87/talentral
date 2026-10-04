import 'server-only';
// Outbound webhooks (MVP-2 month 11). Database triggers queue an event for every endpoint that
// listens for it (webhook_deliveries); the scheduler, and the "Send test event" button, deliver
// them here. Each request is signed so receivers can check it came from Talentral:
//
//   Talentral-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with the secret>
//
// Deliveries that fail are retried with backoff (nextWebhookAttempt) for about a day. Requests never
// follow redirects and never go to private or local networks (unless WEBHOOK_ALLOW_PRIVATE=1, which
// the test suite uses for its local receiver).
import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { system } from '@talentral/db';
import { isPrivateHost, nextWebhookAttempt, webhookUrlProblem } from '@talentral/domain';

export const allowPrivateWebhooks = () => process.env.WEBHOOK_ALLOW_PRIVATE === '1';

export function signWebhook(secret: string, body: string, at = Math.floor(Date.now() / 1000)): string {
  return `t=${at},v1=${createHmac('sha256', secret).update(`${at}.${body}`).digest('hex')}`;
}

type Due = { id: string; endpoint_id: string; event_type: string; payload: Record<string, unknown>; attempts: number; url: string; secret: string; created_at: Date };

// Refuses addresses that resolve to a private network, so a webhook cannot be used to reach
// Talentral's own infrastructure.
async function safeTarget(url: string): Promise<string | null> {
  const problem = webhookUrlProblem(url, allowPrivateWebhooks());
  if (problem) return problem;
  if (allowPrivateWebhooks()) return null;
  const host = new URL(url).hostname;
  const addrs = await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) return 'The address could not be found.';
  return addrs.some((a) => isPrivateHost(a.address)) ? 'The address points to a private network.' : null;
}

async function send(d: Due): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  const blocked = await safeTarget(d.url);
  if (blocked) return { ok: false, status: null, error: blocked };
  const body = JSON.stringify({ id: d.id, ...d.payload });
  try {
    const res = await fetch(d.url, {
      method: 'POST', body, redirect: 'manual', signal: AbortSignal.timeout(10_000),
      headers: {
        'Content-Type': 'application/json', 'User-Agent': 'Talentral-Webhooks/1.0',
        'Talentral-Event': d.event_type, 'Talentral-Delivery': d.id, 'Talentral-Signature': signWebhook(d.secret, body),
      },
    });
    await res.body?.cancel().catch(() => {});
    return res.ok ? { ok: true, status: res.status, error: null } : { ok: false, status: res.status, error: `The endpoint answered ${res.status}.` };
  } catch (e) {
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return { ok: false, status: null, error: timeout ? 'No answer within 10 seconds.' : 'Could not connect to the endpoint.' };
  }
}

// Claims and sends deliveries that are due. Each is claimed by pushing its next attempt forward,
// so overlapping runs never send the same delivery twice.
export async function deliverWebhooks(opts: { limit?: number; ids?: string[] } = {}): Promise<{ delivered: number; failed: number; retrying: number }> {
  const sql = system();
  const out = { delivered: 0, failed: 0, retrying: 0 };
  const due = await sql<Due[]>`
    update public.webhook_deliveries d set next_attempt_at = now() + interval '2 minutes'
    from public.webhook_endpoints e
    where d.endpoint_id = e.id and d.id in (
      select d2.id from public.webhook_deliveries d2 join public.webhook_endpoints e2 on e2.id = d2.endpoint_id
      where d2.status = 'pending' and d2.next_attempt_at <= now() and (e2.active or d2.event_type = 'ping')
        ${opts.ids ? sql`and d2.id in ${sql(opts.ids)}` : sql``}
      order by d2.next_attempt_at limit ${opts.limit ?? 100} for update of d2 skip locked)
    returning d.id, d.endpoint_id, d.event_type, d.payload, d.attempts, e.url, e.secret, d.created_at`;
  await Promise.all(due.map(async (d) => {
    const r = await send(d);
    const attempts = d.attempts + 1;
    if (r.ok) {
      await sql`update public.webhook_deliveries set status = 'delivered', attempts = ${attempts}, last_status = ${r.status}, last_error = null, delivered_at = now() where id = ${d.id}`;
      out.delivered += 1;
      return;
    }
    const next = nextWebhookAttempt(attempts, new Date());
    await sql`update public.webhook_deliveries set attempts = ${attempts}, last_status = ${r.status}, last_error = ${r.error},
      status = ${next ? 'pending' : 'failed'}, next_attempt_at = ${next ?? new Date()} where id = ${d.id}`;
    if (next) out.retrying += 1; else out.failed += 1;
  }));
  return out;
}
