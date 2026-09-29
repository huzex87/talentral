import Link from 'next/link';
import { withUser, type Programme } from '@talentral/db';
import { availability } from '@talentral/domain';
import { Alert, Badge, Card, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { formatDate } from '@/lib/format';

export const metadata = { title: 'Programmes' };

const LABEL = { open: ['Open', 'teal'], not_yet_open: ['Scheduled', 'amber'], closed: ['Closed', 'neutral'], draft: ['Draft', 'violet'] } as const;

export default async function Programmes({ params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const rows = await withUser(user.id, (tx) => tx<(Programme & { applications: number })[]>`
    select p.*, (select count(*)::int from public.applications a where a.programme_id = p.id) as applications
    from public.programmes p where p.tenant_id = ${hub.id} order by p.created_at desc`);
  return (
    <div>
      <PageHeader label="Calls for applications" title="Programmes" description="Each programme has its own public page and application form."
        actions={<LinkButton href={`/dashboard/${slug}/programmes/new`}>New programme</LinkButton>} />
      {!hub.profile_completed_at && <div className="mb-5"><Alert tone="amber" title="Complete your hub profile first">You can prepare programmes now, but you can only open applications once your <Link className="font-semibold underline" href={`/dashboard/${slug}/profile`}>profile</Link> is complete.</Alert></div>}
      {rows.length === 0 ? (
        <EmptyState title="No programmes yet" action={<LinkButton href={`/dashboard/${slug}/programmes/new`}>Create your first programme</LinkButton>}>
          Create a call for applications with its own page, form and dates.
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {rows.map((p) => {
            const [label, tone] = LABEL[availability(p)];
            return (
              <Link key={p.id} href={`/dashboard/${slug}/programmes/${p.id}`}>
                <Card className="flex flex-col gap-3 p-5 transition hover:border-blue/40 hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><Badge tone={tone}>{label}</Badge><span className="truncate font-display text-lg font-semibold">{p.title}</span></div>
                    <p className="mt-1 text-sm text-muted">{p.closes_at ? `Closes ${formatDate(p.closes_at, true)}` : 'No closing date'} · {(p.form as unknown[]).length} questions</p>
                  </div>
                  <div className="text-right"><p className="font-display text-2xl font-semibold">{p.applications}</p><p className="text-xs text-muted">applications</p></div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
