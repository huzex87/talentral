import { withUser, type Programme } from '@talentral/db';
import { Card, PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { smsEnabled } from '@/lib/sms';
import { filterParams, readFilters } from '../applications/query';
import { Composer } from './composer';

export const metadata = { title: 'Messages' };

type Sent = { id: string; channels: string[]; subject: string | null; body: string; recipients: number; emailed: number; texted: number; created_at: Date; author: string | null };

export default async function Messages({ params, searchParams }: { params: Promise<{ hub: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { hub: slug } = await params;
  const f = readFilters(await searchParams);
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const { programmes, sent } = await withUser(user.id, async (tx) => ({
    programmes: await tx<Pick<Programme, 'id' | 'title' | 'tracks'>[]>`select id, title, tracks from public.programmes where tenant_id = ${hub.id} order by created_at desc`,
    sent: await tx<Sent[]>`
      select m.id, m.channels, m.subject, m.body, m.recipients, m.emailed, m.texted, m.created_at, coalesce(u.full_name, u.email) as author
      from public.messages m left join public.users u on u.id = m.author_id
      where m.tenant_id = ${hub.id} order by m.created_at desc limit 50`,
  }));
  // Filters beyond programme, status and track (from the applications list) are carried through.
  const extra = filterParams({ ...f, programme: undefined, status: undefined, track: undefined, sort: 'newest' });

  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader label="Communicate" title="Messages" description="Send one message to a group of applicants by email, SMS or both. Every message is logged for your records and funder reports." />
      <Composer slug={slug} programmes={programmes} initial={{ programme: f.programme, status: f.status, track: f.track, extra }} smsReady={smsEnabled()} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Sent messages</h2>
        {sent.length === 0 ? <p className="text-sm text-muted">Nothing sent yet.</p> : (
          <Card className="divide-y divide-line">
            {sent.map((m) => (
              <div key={m.id} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{m.subject ?? m.body.slice(0, 80)}</p>
                  <p className="text-xs text-muted">{formatDate(m.created_at, true)} · {m.author}</p>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {m.recipients} {m.recipients === 1 ? 'recipient' : 'recipients'}
                  {m.channels.includes('email') && ` · ${m.emailed} emailed`}
                  {m.channels.includes('sms') && ` · ${m.texted} texted`}
                </p>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
