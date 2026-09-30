import { withUser } from '@talentral/db';
import { HealthView } from '@/components/health-view';
import { TopBar } from '@/components/top-bar';
import { Badge, Card, PageHeader } from '@/components/ui';
import { requirePlatformAdmin } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { loadHealth, type Incident } from '@/lib/health-data';
import { updateIncident } from './actions';
import { IncidentForm } from './incident-form';

export const metadata = { title: 'Pilot health' };

const HOUR = 3_600_000;

export default async function PlatformHealth() {
  const user = await requirePlatformAdmin();
  const report = await withUser(user.id, (tx) => loadHealth(tx, null));
  const incidents = report.incidents ?? [];

  return (
    <div className="min-h-dvh">
      <TopBar user={user} />
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader label="Talentral platform" title="Pilot health"
          description="How the pilot measures against Gate G2 across every active hub: learners starting, coming back and attending, whether learners and staff would recommend Talentral, and zero cross-tenant incidents." />
        <HealthView report={report} scope="platform" incidentsCard={
          <Card className="p-5 sm:p-6" id="incidents">
            <h2 className="text-lg font-semibold">Security incident log</h2>
            <p className="mb-4 text-sm text-muted">Record every security incident, even small ones. Follow the breach runbook: when personal data is exposed, report to the NDPC within 72 hours of becoming aware.</p>
            {incidents.length > 0 && (
              <ul className="mb-6 divide-y divide-line rounded-xl border border-line">
                {incidents.map((i) => <IncidentRow key={i.id} i={i} />)}
              </ul>
            )}
            <details className="rounded-xl border border-line bg-canvas/40 p-4" open={incidents.length === 0 ? undefined : undefined}>
              <summary className="cursor-pointer font-semibold">Record an incident</summary>
              <div className="mt-4"><IncidentForm today={report.today} /></div>
            </details>
          </Card>
        } />
      </main>
    </div>
  );
}

function IncidentRow({ i }: { i: Incident }) {
  const due = new Date(new Date(i.created_at).getTime() + 72 * HOUR);
  const overdue = i.personal_data && !i.ndpc_notified_on && Date.now() > due.getTime();
  return (
    <li className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{formatDate(i.occurred_on)}</p>
          {i.cross_tenant && <Badge tone="danger">Cross-tenant</Badge>}
          {i.personal_data && <Badge tone="amber">Personal data</Badge>}
          {i.resolved_on ? <Badge tone="teal">Resolved {formatDate(i.resolved_on)}</Badge> : <Badge tone="blue">Open</Badge>}
        </div>
        <p className="mt-1 whitespace-pre-line text-[15px]">{i.summary}</p>
        {i.personal_data && (
          <p className={`mt-1 text-sm ${overdue ? 'font-semibold text-danger' : 'text-muted'}`}>
            {i.ndpc_notified_on ? `Reported to the NDPC on ${formatDate(i.ndpc_notified_on)}.` : `${overdue ? 'Overdue: report' : 'Report'} to the NDPC by ${formatDate(due, true)}.`}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {i.personal_data && !i.ndpc_notified_on && (
          <form action={updateIncident.bind(null, i.id, 'notified')}><button className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-blue/40 hover:text-blue">Reported to NDPC</button></form>
        )}
        {!i.resolved_on && (
          <form action={updateIncident.bind(null, i.id, 'resolved')}><button className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:border-teal-700/40 hover:text-teal-700">Mark resolved</button></form>
        )}
      </div>
    </li>
  );
}
