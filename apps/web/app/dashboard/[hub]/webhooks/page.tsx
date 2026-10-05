import { Webhook } from 'lucide-react';
import { withUser } from '@talentral/db';
import { WEBHOOK_EVENTS, type WebhookEvent } from '@talentral/domain';
import { Badge, Card, EmptyState, PageHeader, SectionHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { AddWebhookForm, EndpointActions, RedeliverButton, SecretValue } from './forms';

export const metadata = { title: 'Webhooks' };

type Endpoint = { id: string; url: string; description: string | null; events: WebhookEvent[]; secret: string; active: boolean; created_at: Date };
type Delivery = { id: string; endpoint_id: string; event_type: string; status: 'pending' | 'delivered' | 'failed'; attempts: number; last_status: number | null; last_error: string | null; created_at: Date };

const STATUS = { delivered: ['teal', 'Delivered'], pending: ['amber', 'Retrying'], failed: ['danger', 'Failed'] } as const;

export default async function WebhooksPage({ params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const { endpoints, deliveries } = await withUser(user.id, async (tx) => ({
    endpoints: await tx<Endpoint[]>`select id, url, description, events, secret, active, created_at from webhook_endpoints where tenant_id = ${hub.id} order by created_at`,
    deliveries: await tx<Delivery[]>`
      select id, endpoint_id, event_type, status, attempts, last_status, last_error, created_at from (
        select d.*, row_number() over (partition by d.endpoint_id order by d.created_at desc) as n from webhook_deliveries d where d.tenant_id = ${hub.id}) x
      where n <= 10 order by created_at desc`,
  }));

  return (
    <div className="space-y-8">
      <PageHeader label={hub.name} title="Webhooks"
        description="Send your hub’s events to your own systems as they happen: a CRM, a spreadsheet tool or a funder’s platform. Every request is signed so you can check it came from Talentral." />

      <section aria-labelledby="endpoints">
        <SectionHeader id="endpoints" title="Endpoints" description="Up to 10. Paused endpoints keep their settings but receive nothing." />
        {endpoints.length === 0 ? (
          <EmptyState icon={Webhook} title="No endpoints yet">Add one below to start receiving events such as new applications and issued certificates.</EmptyState>
        ) : (
          <div className="space-y-4">
            {endpoints.map((e) => {
              const recent = deliveries.filter((d) => d.endpoint_id === e.id);
              return (
                <Card key={e.id} className="overflow-hidden">
                  <div className="space-y-4 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-all font-mono text-[13px] font-medium text-ink">{e.url}</p>
                        <p className="mt-1 text-sm text-muted">{e.description ? `${e.description} · ` : ''}Added {formatDate(e.created_at)}</p>
                      </div>
                      {e.active ? <Badge tone="teal">Active</Badge> : <Badge>Paused</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-1.5" aria-label="Events">
                      {e.events.map((ev) => <span key={ev} title={WEBHOOK_EVENTS[ev]} className="rounded-md border border-line bg-canvas px-1.5 py-px font-mono text-[11.5px] text-ink-2">{ev}</span>)}
                    </div>
                    <div>
                      <p className="mb-1.5 text-[13px] font-medium text-muted">Signing secret</p>
                      <SecretValue secret={e.secret} />
                    </div>
                    <EndpointActions slug={slug} id={e.id} active={e.active} />
                  </div>
                  <div className="border-t border-line bg-canvas/50">
                    <p className="px-5 pb-1 pt-3 text-[13px] font-medium text-muted">Recent deliveries</p>
                    {recent.length === 0 ? <p className="px-5 pb-4 text-sm text-muted">Nothing sent yet.</p> : (
                      <ul className="divide-y divide-line" aria-label={`Recent deliveries to ${e.url}`}>
                        {recent.map((d) => {
                          const [tone, label] = STATUS[d.status];
                          return (
                            <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
                              <span className="flex min-w-0 items-center gap-2.5">
                                <Badge tone={tone}>{label}</Badge>
                                <span className="font-mono text-[12.5px]">{d.event_type}</span>
                                <span className="text-muted">{formatDate(d.created_at, true)}</span>
                              </span>
                              <span className="flex items-center gap-3 text-[13px] text-muted">
                                <span>{d.last_status ? `HTTP ${d.last_status}` : d.last_error ?? (d.attempts ? '' : 'Waiting')}{d.attempts > 1 ? ` · ${d.attempts} tries` : ''}</span>
                                {d.status !== 'pending' && <RedeliverButton slug={slug} endpoint={e.id} delivery={d.id} />}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="add-endpoint">
        <SectionHeader id="add-endpoint" title="Add an endpoint" />
        <Card className="p-5 sm:p-6"><AddWebhookForm slug={slug} /></Card>
      </section>

      <section aria-labelledby="verify-sig">
        <SectionHeader id="verify-sig" title="Checking the signature" description="Recompute the signature on your server and compare before trusting a request." />
        <Card className="p-5 text-sm leading-relaxed text-ink-2 sm:p-6">
          <p>Each request is a JSON POST with the headers <code className="font-mono text-[13px]">Talentral-Event</code>, <code className="font-mono text-[13px]">Talentral-Delivery</code> and <code className="font-mono text-[13px]">Talentral-Signature: t=…,v1=…</code>. The <code className="font-mono text-[13px]">v1</code> value is the HMAC-SHA256 of <code className="font-mono text-[13px]">t</code>, a full stop and the raw request body, keyed with your signing secret, in hex. Reject requests more than five minutes old. Answer with any 2xx status within 10 seconds; anything else is retried for about a day.</p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-midnight p-4 font-mono text-[12.5px] leading-relaxed text-[#E7EAF6]" tabIndex={0} aria-label="Example in Node.js">{`import { createHmac, timingSafeEqual } from 'node:crypto';

function fromTalentral(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}`}</pre>
        </Card>
      </section>
    </div>
  );
}
