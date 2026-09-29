import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { availability, type FormField } from '@talentral/domain';
import { Alert, Badge, Card } from '@/components/ui';
import { publicHub } from '@/lib/hubs';
import { formatDate } from '@/lib/format';
import { ApplicationForm } from './application-form';

type Props = { params: Promise<{ hub: string; programme: string }> };

async function load(params: Props['params']) {
  const { hub, programme } = await params;
  const data = await publicHub(hub);
  const prog = data?.programmes.find((p) => p.slug === programme);
  return data && prog ? { ...data, prog } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load(params);
  return data ? { title: `${data.prog.title} · ${data.hub.name}`, description: data.prog.summary ?? undefined } : {};
}

export default async function ProgrammePage({ params }: Props) {
  const data = await load(params);
  if (!data) notFound();
  const { hub, prog } = data;
  const state = availability(prog);

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        {state === 'draft' && <div className="mb-5"><Alert tone="violet" title="Draft preview">Only your hub team can see this page. Open applications from the dashboard to publish it.</Alert></div>}
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--hub)]">{hub.name}</p>
        <h1 className="mt-1 text-3xl font-semibold leading-tight sm:text-4xl">{prog.title}</h1>
        {prog.summary && <p className="mt-3 text-lg text-muted">{prog.summary}</p>}
        {prog.description && <div className="mt-5 whitespace-pre-line leading-relaxed">{prog.description}</div>}
        {prog.eligibility && (
          <section className="mt-6">
            <h2 className="text-lg font-semibold">Who can apply</h2>
            <p className="mt-1.5 whitespace-pre-line leading-relaxed">{prog.eligibility}</p>
          </section>
        )}

        <Card className="mt-8 p-5 sm:p-7">
          {state === 'open' || state === 'draft' ? (
            <ApplicationForm programmeId={prog.id} fields={prog.form as FormField[]} tracks={prog.tracks} hubName={hub.name} disabled={state === 'draft'} />
          ) : state === 'not_yet_open' ? (
            <Alert tone="amber" title="Applications have not opened yet">{prog.opens_at ? `They open on ${formatDate(prog.opens_at, true)}.` : null}</Alert>
          ) : (
            <Alert tone="neutral" title="Applications are closed">Thank you for your interest. Follow {hub.name} for future programmes.</Alert>
          )}
        </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card className="p-5">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">Key dates</h2>
          <dl className="mt-3 space-y-3 text-[15px]">
            <div><dt className="text-muted">Status</dt><dd className="mt-0.5"><Badge tone={state === 'open' ? 'teal' : state === 'not_yet_open' ? 'amber' : 'neutral'}>{state === 'open' ? 'Open' : state === 'not_yet_open' ? 'Opening soon' : state === 'draft' ? 'Draft' : 'Closed'}</Badge></dd></div>
            {prog.opens_at && <div><dt className="text-muted">Opens</dt><dd className="font-semibold">{formatDate(prog.opens_at, true)}</dd></div>}
            {prog.closes_at && <div><dt className="text-muted">Closes</dt><dd className="font-semibold">{formatDate(prog.closes_at, true)}</dd></div>}
            {prog.capacity && <div><dt className="text-muted">Places</dt><dd className="font-semibold">{prog.capacity}</dd></div>}
          </dl>
        </Card>
        {prog.tracks.length > 0 && (
          <Card className="p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">Tracks</h2>
            <ul className="mt-3 flex flex-wrap gap-2">{prog.tracks.map((t) => <li key={t}><Badge tone="blue">{t}</Badge></li>)}</ul>
          </Card>
        )}
        <p className="px-1 text-xs leading-relaxed text-muted">All dates are West Africa Time. Applications take about 10 minutes. You can use your phone.</p>
      </aside>
    </div>
  );
}
