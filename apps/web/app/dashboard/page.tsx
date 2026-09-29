import Link from 'next/link';
import { redirect } from 'next/navigation';
import { withUser } from '@talentral/db';
import { TopBar } from '@/components/top-bar';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';

export const metadata = { title: 'Your hubs' };

export default async function Dashboard() {
  const user = await requireUser();
  const hubs = await withUser(user.id, (tx) => tx<{ slug: string; name: string; role: string; complete: boolean }[]>`
    select t.slug, t.name, m.role, t.profile_completed_at is not null as complete
    from public.memberships m join public.tenants t on t.id = m.tenant_id
    where m.user_id = ${user.id} order by t.name`);
  if (hubs.length === 1 && !user.is_platform_admin) redirect(`/dashboard/${hubs[0]!.slug}`);
  return (
    <div className="min-h-dvh">
      <TopBar user={user} />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <PageHeader label="Welcome" title={user.full_name ? `Hello, ${user.full_name.split(' ')[0]}` : 'Your hubs'} description="Choose a hub to manage." />
        {hubs.length === 0 ? (
          <EmptyState title="You are not part of a hub yet">
            {user.is_platform_admin ? <>Create hubs from the <Link className="font-semibold text-blue" href="/platform">platform console</Link>.</> : 'Ask your hub owner to invite you.'}
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {hubs.map((h) => (
              <Link key={h.slug} href={`/dashboard/${h.slug}`}>
                <Card className="flex items-center justify-between p-5 transition hover:border-blue/40 hover:shadow-md">
                  <div><p className="font-display text-lg font-semibold">{h.name}</p><p className="text-sm capitalize text-muted">{h.role}</p></div>
                  {!h.complete && <Badge tone="amber">Profile incomplete</Badge>}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
