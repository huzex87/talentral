import Link from 'next/link';
import { withUser, type Programme } from '@talentral/db';
import { STATUS_LABELS, availability, pickSurvey, type ApplicationStatus } from '@talentral/domain';
import { NpsPrompt } from '@/components/nps-prompt';
import { Alert, Card, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { canManage, hubAccess } from '@/lib/auth';
import { hubUrl } from '@/lib/urls';
import { formatDate } from '@/lib/format';
import { mySurveys } from '@/lib/nps';

export const metadata = { title: 'Overview' };

type Count = { key: string | null; n: number };

function Bars({ title, rows, total }: { title: string; rows: Count[]; total: number }) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">{title}</h3>
      {rows.length === 0 ? <p className="mt-3 text-sm text-muted">No data yet.</p> : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((r) => (
            <li key={r.key ?? 'none'}>
              <div className="flex justify-between text-sm"><span className="truncate pr-2">{r.key ?? 'Not stated'}</span><span className="font-semibold">{r.n}</span></div>
              <div className="mt-1 h-2 rounded-full bg-canvas"><div className="h-2 rounded-full bg-blue" style={{ width: `${Math.max(3, (r.n / Math.max(total, 1)) * 100)}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function Overview({ params, searchParams }: { params: Promise<{ hub: string }>; searchParams: Promise<{ programme?: string }> }) {
  const { hub: slug } = await params;
  const { programme } = await searchParams;
  const { user, hub, role } = await hubAccess(slug);
  const pid = programme && /^[0-9a-f-]{36}$/.test(programme) ? programme : null;
  const data = await withUser(user.id, async (tx) => {
    const scope = pid ? tx`tenant_id = ${hub.id} and programme_id = ${pid}` : tx`tenant_id = ${hub.id}`;
    const group = (expr: string) => tx<Count[]>`select ${tx.unsafe(expr)} as key, count(*)::int as n from public.applications where ${scope} group by 1 order by 2 desc limit 8`;
    const [total] = await tx<{ n: number; week: number }[]>`select count(*)::int as n, count(*) filter (where submitted_at > now() - interval '7 days')::int as week from public.applications where ${scope}`;
    return {
      total: total?.n ?? 0, week: total?.week ?? 0,
      status: await group('status'), track: await group('track'),
      gender: await group(`answers ->> 'gender'`), state: await group(`answers ->> 'state_of_residence'`),
      programmes: await tx<Programme[]>`select * from public.programmes where tenant_id = ${hub.id} order by created_at desc`,
      support: await tx<{ staff_email: string; reason: string; created_at: Date; expires_at: Date; ended_at: Date | null }[]>`
        select staff_email, reason, created_at, expires_at, ended_at from public.support_grants
        where tenant_id = ${hub.id} and created_at > now() - interval '90 days' order by created_at desc limit 5`,
      survey: role === 'platform' ? null : pickSurvey(await mySurveys(tx), 'staff', new Date(), hub.id),
    };
  });
  const open = data.programmes.filter((p) => availability(p) === 'open');
  const manage = canManage(role);

  return (
    <div className="space-y-6">
      <PageHeader label={hub.name} title="Overview" actions={manage ? <LinkButton href={`/dashboard/${slug}/programmes/new`}>New programme</LinkButton> : undefined} />
      {data.survey && <NpsPrompt tenantId={hub.id} cohortId={null} audience="staff" hubName={hub.name} />}
      {manage && !hub.profile_completed_at && (
        <Alert tone="amber" title="Finish setting up your hub">Complete your <Link href={`/dashboard/${slug}/profile`} className="font-semibold underline">hub profile</Link> (logo, tagline, description and contact email) to publish your page and open applications.</Alert>
      )}

      {data.programmes.length > 1 && (
        <form className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="programme" className="font-semibold">Showing</label>
          <select id="programme" name="programme" defaultValue={pid ?? ''} className="h-9 rounded-lg border border-line bg-white px-2">
            <option value="">All programmes</option>{data.programmes.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <button className="h-9 rounded-lg px-3 font-semibold text-blue hover:bg-blue-50">Update</button>
        </form>
      )}

      {data.programmes.length === 0 ? (
        manage ? <EmptyState title="Create your first call for applications" action={<LinkButton href={`/dashboard/${slug}/programmes/new`}>New programme</LinkButton>}>Each programme gets its own page and application form that you can share.</EmptyState>
          : <EmptyState title="No programmes yet">Your hub admins have not created a programme yet.</EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-5"><p className="text-sm text-muted">Applications</p><p className="mt-1 font-display text-4xl font-semibold">{data.total}</p></Card>
            <Card className="p-5"><p className="text-sm text-muted">In the last 7 days</p><p className="mt-1 font-display text-4xl font-semibold">{data.week}</p></Card>
            <Card className="p-5"><p className="text-sm text-muted">Open calls</p><p className="mt-1 font-display text-4xl font-semibold">{open.length}</p>
              {open[0] && <a href={hubUrl(hub.slug, `/apply/${open[0].slug}`)} target="_blank" className="mt-1 block truncate text-sm font-semibold text-blue hover:underline">{open[0].title} ↗</a>}</Card>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Bars title="By status" rows={data.status.map((r) => ({ ...r, key: STATUS_LABELS[r.key as ApplicationStatus] ?? r.key }))} total={data.total} />
            <Bars title="By track" rows={data.track} total={data.total} />
            <Bars title="By gender" rows={data.gender} total={data.total} />
            <Bars title="By state of residence" rows={data.state} total={data.total} />
          </div>
        </>
      )}
      {manage && data.support.length > 0 && (
        <Card className="p-5" role="region" aria-labelledby="support-visits">
          <h2 id="support-visits" className="text-sm font-bold uppercase tracking-[0.12em] text-muted">Talentral support visits</h2>
          <p className="mt-1 text-sm text-muted">When the Talentral team opens your dashboard to help, it shows here and in your audit log.</p>
          <ul className="mt-3 divide-y divide-line text-sm">
            {data.support.map((v, i) => {
              const live = !v.ended_at && new Date(v.expires_at).getTime() > Date.now();
              return (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                  <span className="min-w-0"><b>{v.staff_email}</b><span className="block text-muted">{v.reason}</span></span>
                  <span className="text-xs text-muted">{formatDate(v.created_at, true)}{live ? <b className="ml-1 text-amber-800">· active now</b> : ''}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
