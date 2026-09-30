import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { TopBar } from '@/components/top-bar';
import { Card } from '@/components/ui';
import { requirePlatformAdmin } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { SupportForm } from './support-form';

export const metadata = { title: 'Support access' };

export default async function SupportAccess({ params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const user = await requirePlatformAdmin();
  const data = await withUser(user.id, async (tx) => {
    const [hub] = await tx<{ id: string; name: string }[]>`select id, name from public.tenants where slug = ${slug}`;
    if (!hub) return null;
    const recent = await tx<{ staff_email: string; reason: string; created_at: Date }[]>`
      select staff_email, reason, created_at from public.support_grants where tenant_id = ${hub.id} order by created_at desc limit 5`;
    return { hub, recent };
  });
  if (!data) notFound();
  return (
    <div className="min-h-dvh">
      <TopBar user={user} />
      <main id="main" tabIndex={-1} className="mx-auto max-w-xl px-4 py-8 sm:px-6">
        <Link href="/platform" className="text-sm font-semibold text-violet hover:underline">← Platform</Link>
        <h1 className="mt-2 text-3xl font-semibold">Open {data.hub.name}</h1>
        <p className="mt-1 text-muted">Hub dashboards belong to the hub. Talentral staff open one only to help, for up to four hours at a time.</p>
        <Card className="mt-6 p-5 sm:p-6">
          <SupportForm slug={slug} hub={data.hub.name} />
        </Card>
        <ul className="mt-6 space-y-1.5 text-sm text-muted" aria-label="What the hub sees">
          <li>✓ The hub’s owners get an email saying who you are and why you came in.</li>
          <li>✓ Your visit and everything you change appear in the hub’s audit log.</li>
          <li>✓ Access ends by itself after four hours, or when you end it.</li>
        </ul>
        {data.recent.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">Recent support visits</h2>
            <ul className="mt-2 divide-y divide-line text-sm">
              {data.recent.map((r, i) => <li key={i} className="py-2"><b>{r.staff_email}</b> · {formatDate(r.created_at, true)}<span className="block text-muted">{r.reason}</span></li>)}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
