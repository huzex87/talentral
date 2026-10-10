import Link from 'next/link';
import { ArrowUpRight, ShieldAlert } from 'lucide-react';
import { cookies } from 'next/headers';
import { withUser } from '@talentral/db';
import { DashNav } from '@/components/dash-nav';
import { CommandPalette, SearchButton } from '@/components/command-palette';
import { InboxBell, type BellItem } from '@/components/inbox-bell';
import { loadInbox, seenCookie } from '@/lib/staff-inbox';
import { TalentralLogo } from '@/components/logo';
import { accountOf } from '@/components/top-bar';
import { AccountMenu } from '@/components/account-menu';
import { canManage, canSelect, hubAccess } from '@/lib/auth';
import { hubPath } from '@/lib/urls';
import { formatDate } from '@/lib/format';
import { endSupport } from '../../platform/support/actions';

const ROLE_LABELS: Record<string, string> = { owner: 'Owner', admin: 'Admin', reviewer: 'Reviewer', facilitator: 'Facilitator', platform: 'Platform admin' };

// The hub's mark: its uploaded logo, or its first letter on the hub's colour.
function HubMark({ slug, name, logo, color }: { slug: string; name: string; logo: boolean; color: string | null }) {
  return logo
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={`/media/${slug}/logo`} alt="" className="size-8 shrink-0 rounded-lg bg-white object-contain p-0.5" />
    : <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white ring-1 ring-white/15" style={{ background: color ?? '#2E5BFF' }} aria-hidden>{name.trim()[0]?.toUpperCase()}</span>;
}

export default async function HubDashLayout({ children, params }: { children: React.ReactNode; params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const { user, hub, role, supportUntil } = await hubAccess(slug);
  const manage = canManage(role);
  const select = canSelect(role);
  const roleLabel = ROLE_LABELS[role] ?? role;
  const seen = Number((await cookies()).get(seenCookie(hub.id))?.value) || 0;
  const { counts, inbox, digest } = await withUser(user.id, async (tx) => {
    const [c] = await tx<{ to_score: number; to_grade: number; digest: boolean | null }[]>`
      select (select count(*)::int from public.applications a where ${select} and a.tenant_id = ${hub.id} and a.status in ('submitted', 'under_review')
                and not exists (select 1 from public.application_scores s where s.application_id = a.id and s.reviewer_id = ${user.id})) as to_score,
             (select count(*)::int from public.submissions where tenant_id = ${hub.id} and status = 'submitted') as to_grade,
             (select weekly_digest from public.memberships where tenant_id = ${hub.id} and user_id = ${user.id}) as digest`;
    return { counts: { toScore: c?.to_score ?? 0, toGrade: c?.to_grade ?? 0 }, inbox: await loadInbox(tx, hub.id, hub.slug, manage), digest: c?.digest ?? null };
  });
  const bell: BellItem[] = inbox.map((i) => ({ key: i.key, kind: i.kind, title: i.title, detail: i.detail, href: i.href, unread: i.at.getTime() > seen }));

  const hubIdentity = (
    <Link href={`/dashboard/${hub.slug}`} className="flex min-w-0 items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.04] p-2 transition-colors hover:bg-white/[0.08]">
      <HubMark slug={hub.slug} name={hub.name} logo={!!hub.logo_path} color={hub.brand_color} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-semibold text-white">{hub.name}</span>
        <span className="block truncate text-xs text-[#AEB5C8]">{roleLabel}</span>
      </span>
    </Link>
  );

  return (
    <div className="min-h-dvh print:bg-white lg:pl-64">
      {/* Header and tabs, phones and tablets. */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-midnight text-white lg:hidden print:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <TalentralLogo dark height={20} href="/dashboard" />
            <span className="h-5 w-px shrink-0 bg-white/20" aria-hidden />
            <Link href={`/dashboard/${hub.slug}`} className="truncate text-sm font-semibold text-white">{hub.name}</Link>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <SearchButton compact />
            <InboxBell slug={hub.slug} items={bell} digest={digest} />
            <AccountMenu {...accountOf(user)} tone="dark" extra={user.is_platform_admin ? [{ href: '/platform', label: 'Platform' }] : []} />
          </div>
        </div>
        <div className="px-4 sm:px-6"><DashNav slug={hub.slug} manage={manage} select={select} counts={counts} /></div>
      </header>

      {/* Sidebar, large screens. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-midnight text-white lg:flex print:hidden">
        <div className="flex h-16 shrink-0 items-center justify-between pl-5 pr-3"><TalentralLogo dark height={24} href="/dashboard" /><InboxBell slug={hub.slug} items={bell} digest={digest} placement="right" /></div>
        <div className="space-y-2 px-3 pb-3">{hubIdentity}<SearchButton /></div>
        <div className="flex-1 overflow-y-auto px-3 pb-6 pt-1 [scrollbar-width:thin]"><DashNav slug={hub.slug} manage={manage} select={select} counts={counts} /></div>
        <div className="shrink-0 space-y-1 border-t border-white/10 p-3">
          <a href={hubPath(hub.slug)} target="_blank" className="flex h-8 items-center justify-between rounded-md px-2.5 text-sm text-[#C3C9D9] transition-colors hover:bg-white/[0.06] hover:text-white">
            View public page <ArrowUpRight className="size-4 text-[#7D86A0]" aria-hidden />
          </a>
          {user.is_platform_admin && (
            <Link href="/platform" className="flex h-8 items-center rounded-md px-2.5 text-sm text-[#C3C9D9] transition-colors hover:bg-white/[0.06] hover:text-white">Platform</Link>
          )}
          <div className="flex items-center pt-2">
            <AccountMenu {...accountOf(user)} tone="dark" placement="up" showEmail />
          </div>
        </div>
      </aside>

      {role === 'platform' && supportUntil && (
        <div className="border-b border-amber-800/15 bg-amber-50 print:hidden" role="status">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 sm:flex-nowrap gap-y-2 px-4 py-2.5 text-sm text-amber-800 sm:px-6 lg:px-10">
            <p className="flex min-w-0 flex-1 items-start gap-2"><ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden /><span><b className="font-semibold">Support access</b> to {hub.name} until {formatDate(supportUntil, true)} WAT. The hub’s owners can see this visit and everything you change.</span></p>
            <form action={endSupport.bind(null, hub.slug)} className="shrink-0"><button className="h-8 rounded-md border border-amber-800/25 bg-white px-3 text-sm font-medium transition-colors hover:bg-amber-50">End support session</button></form>
          </div>
        </div>
      )}
      <CommandPalette slug={hub.slug} manage={manage} select={select} />
      <main id="main" tabIndex={-1} className="mx-auto min-w-0 max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
