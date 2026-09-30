import Link from 'next/link';
import { DashNav } from '@/components/dash-nav';
import { TopBar } from '@/components/top-bar';
import { Badge } from '@/components/ui';
import { canManage, hubAccess } from '@/lib/auth';
import { hubPath } from '@/lib/urls';
import { formatDate } from '@/lib/format';
import { endSupport } from '../../platform/support/actions';

export default async function HubDashLayout({ children, params }: { children: React.ReactNode; params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const { user, hub, role, supportUntil } = await hubAccess(slug);
  const manage = canManage(role);
  return (
    <div className="min-h-dvh print:bg-white">
      <div className="print:hidden"><TopBar user={user}>
        <span className="hidden h-6 w-px bg-line sm:block" />
        <Link href={`/dashboard/${hub.slug}`} className="hidden truncate font-display text-[17px] font-semibold sm:block">{hub.name}</Link>
      </TopBar></div>
      {role === 'platform' && supportUntil && (
        <div className="border-b border-amber-800/20 bg-amber-50 print:hidden" role="status">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm text-amber-800 sm:px-6">
            <p><b>Support access</b> to {hub.name} until {formatDate(supportUntil, true)} WAT. The hub’s owners can see this visit and everything you change.</p>
            <form action={endSupport.bind(null, hub.slug)}><button className="rounded-lg border border-amber-800/30 bg-white px-3 py-1.5 font-semibold hover:bg-amber-50">End support session</button></form>
          </div>
        </div>
      )}
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:py-8 print:block print:p-0">
        <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start print:hidden">
          <p className="mb-2 hidden truncate px-3 text-xs font-bold uppercase tracking-[0.12em] text-muted lg:block">{hub.name}</p>
          <DashNav slug={hub.slug} manage={manage} />
          <div className="mt-4 hidden space-y-2 px-3 text-sm lg:block">
            <Badge tone="violet">{role === 'platform' ? 'Platform admin' : role}</Badge>
            <p><a href={hubPath(hub.slug)} target="_blank" className="font-semibold text-blue hover:underline">View public page ↗</a></p>
          </div>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
