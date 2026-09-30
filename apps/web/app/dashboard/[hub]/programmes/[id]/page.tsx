import { notFound } from 'next/navigation';
import { withUser, type Programme } from '@talentral/db';
import { availability, type Criterion, type FormField } from '@talentral/domain';
import { Alert, Badge, Card, LinkButton, PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { toLocalInput } from '@/lib/format';
import { hubUrl } from '@/lib/urls';
import { aiEnabled } from '@/lib/ai';
import { partnerLogoUrl } from '@/lib/hubs';
import { DetailsForm } from './details-form';
import { FormBuilder } from './form-builder';
import { PartnersManager, type PartnerRow } from './partners-manager';
import { RubricBuilder } from './rubric-builder';
import { StatusControls } from './status-controls';

export const metadata = { title: 'Edit programme' };

const LABEL = { open: ['Open for applications', 'teal'], not_yet_open: ['Scheduled to open', 'amber'], closed: ['Closed', 'neutral'], draft: ['Draft', 'violet'] } as const;

export default async function EditProgramme({ params, searchParams }: { params: Promise<{ hub: string; id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { hub: slug, id } = await params;
  const { created } = await searchParams;
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [p] = await withUser(user.id, (tx) => tx<(Programme & { applications: number; scored: number })[]>`
    select p.*, (select count(*)::int from public.applications a where a.programme_id = p.id) as applications,
      (select count(*)::int from public.application_scores s join public.applications a on a.id = s.application_id where a.programme_id = p.id) as scored
    from public.programmes p where p.id = ${id} and p.tenant_id = ${hub.id}`);
  if (!p) notFound();
  const partners = await withUser(user.id, (tx) => tx<(Omit<PartnerRow, 'logo'> & { logo_path: string })[]>`
    select id, name, role, logo_path from public.programme_partners where programme_id = ${p.id} order by position, created_at`);
  const [label, tone] = LABEL[availability(p)];
  const url = hubUrl(hub.slug, `/apply/${p.slug}`);

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader label="Programme" title={p.title} description={<span className="inline-flex items-center gap-2"><Badge tone={tone}>{label}</Badge> {p.applications} applications</span>}
        actions={<>
          <LinkButton variant="secondary" href={url} target="_blank">Preview page</LinkButton>
          <LinkButton variant="secondary" href={`/dashboard/${slug}/programmes/${p.id}/import`}>Import participants</LinkButton>
          <LinkButton variant="ghost" href={`/dashboard/${slug}/applications?programme=${p.id}`}>Applications</LinkButton>
        </>} />
      {created && <Alert tone="violet" title="Programme created">Add the details and review the application form, then open applications when you are ready.</Alert>}

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Publishing</h2>
        <p className="mt-1 mb-4 text-sm text-muted">Share this link once applications are open: <a href={url} className="break-all font-mono text-blue" target="_blank">{url}</a></p>
        <StatusControls slug={slug} id={p.id} status={p.status} />
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold">Details</h2>
        <DetailsForm slug={slug} programme={p} opens={toLocalInput(p.opens_at)} closes={toLocalInput(p.closes_at)} publicUrl={url} ai={aiEnabled()} />
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Partners and sponsors</h2>
        <p className="mb-4 mt-1 text-sm text-muted">Funders, sponsors and partners behind this programme. Their logos appear on the programme page and under &ldquo;Supported by&rdquo; on every certificate, in this order. Each certificate keeps the logos it was issued with.</p>
        <PartnersManager slug={slug} programmeId={p.id} partners={partners.map(({ logo_path, ...r }) => ({ ...r, logo: partnerLogoUrl(hub.slug, { id: r.id, logo_path }) }))} />
      </Card>

      <section>
        <h2 className="text-lg font-semibold">Application form</h2>
        <p className="mb-4 mt-1 text-sm text-muted">Click a question to edit it. Changes apply to new applicants only.</p>
        <FormBuilder slug={slug} programmeId={p.id} initial={p.form as FormField[]} hasTracks={p.tracks.length > 0} />
      </section>

      <section>
        <h2 className="text-lg font-semibold">Screening rubric</h2>
        <p className="mb-4 mt-1 text-sm text-muted">Your team scores each applicant against these criteria. Scores are weighted by importance, averaged across reviewers and shown as a percentage, so you can rank applicants and select fairly.</p>
        <RubricBuilder slug={slug} programmeId={p.id} initial={p.rubric as Criterion[]} scored={p.scored} />
      </section>
    </div>
  );
}
