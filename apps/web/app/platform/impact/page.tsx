import Link from 'next/link';
import { withUser } from '@talentral/db';
import type { Impact } from '@talentral/domain';
import { Funnel, KpiTile } from '@/components/impact-charts';
import { TopBar } from '@/components/top-bar';
import { Card, PageHeader } from '@/components/ui';
import { requirePlatformAdmin } from '@/lib/auth';
import { loadImpact } from '@/lib/impact-data';

export const metadata = { title: 'Impact across hubs' };

export default async function PlatformImpact() {
  const user = await requirePlatformAdmin();
  const hubs = await withUser(user.id, async (tx) => {
    const list = await tx<{ id: string; slug: string; name: string }[]>`select id, slug, name from public.tenants where status = 'active' order by name`;
    const out: { hub: (typeof list)[number]; impact: Impact }[] = [];
    for (const hub of list) out.push({ hub, impact: (await loadImpact(tx, hub.id, {})).impact });
    return out;
  });
  const sum = (f: (i: Impact) => number) => hubs.reduce((s, h) => s + f(h.impact), 0);
  const funnel = (hubs[0]?.impact.funnel ?? []).map((s, i) => ({ stage: s.stage, n: sum((x) => x.funnel[i]!.n) }));
  const completed = sum((i) => i.kpis.completed);
  const placed = sum((i) => i.kpis.placed);

  return (
    <div className="min-h-dvh">
      <TopBar user={user} />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <PageHeader label="Talentral platform" title="Impact across hubs" description="Every partner hub in one view: reach, completion, proof of skill and work outcomes." />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiTile label="Hubs" value={hubs.length} tone="violet" />
          <KpiTile label="Applicants" value={sum((i) => i.kpis.applicants)} />
          <KpiTile label="Enrolled" value={sum((i) => i.kpis.enrolled)} />
          <KpiTile label="Completed" value={completed} tone="blue" />
          <KpiTile label="Certified" value={sum((i) => i.kpis.certified)} />
          <KpiTile label="Placed in work" value={placed} note={completed ? `${Math.round((placed / completed) * 100)}% of completers` : undefined} tone="teal" />
        </div>
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold">From application to work, all hubs</h2>
          <Funnel stages={funnel} />
        </Card>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-line bg-canvas text-xs uppercase tracking-[0.08em] text-muted">
                <tr><th className="px-4 py-3">Hub</th><th className="px-4 py-3 text-right">Applicants</th><th className="px-4 py-3 text-right">Enrolled</th><th className="px-4 py-3 text-right">Attendance</th>
                  <th className="px-4 py-3 text-right">Completion</th><th className="px-4 py-3 text-right">Certified</th><th className="px-4 py-3 text-right">Placed</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {hubs.map(({ hub, impact: { kpis: k } }) => (
                  <tr key={hub.id}>
                    <td className="px-4 py-3"><Link href={`/dashboard/${hub.slug}/impact`} className="font-semibold hover:text-blue">{hub.name}</Link></td>
                    <td className="px-4 py-3 text-right tabular-nums">{k.applicants}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{k.enrolled}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{k.averageAttendance === null ? '–' : `${k.averageAttendance}%`}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{k.completionRate === null ? '–' : `${k.completionRate}%`}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{k.certified}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-teal-700">{k.placed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}
