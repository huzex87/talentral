import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser, type Programme } from '@talentral/db';
import type { FormField } from '@talentral/domain';
import { PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { Importer } from './importer';

export const metadata = { title: 'Import participants' };

// For programmes whose call and selection ran elsewhere (for example on a funder's platform):
// bring the selected participants in from a spreadsheet.
export default async function ImportParticipants({ params }: { params: Promise<{ hub: string; id: string }> }) {
  const { hub: slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const [p] = await withUser(user.id, (tx) => tx<Programme[]>`select * from public.programmes where id = ${id} and tenant_id = ${hub.id}`);
  if (!p) notFound();

  return (
    <div className="max-w-4xl">
      <Link href={`/dashboard/${slug}/programmes/${p.id}`} className="text-sm font-semibold text-blue hover:underline">← {p.title}</Link>
      <div className="mt-3">
        <PageHeader label="Programme" title="Import participants"
          description="Selected participants on another platform? Upload the list as CSV or Excel and they join this programme alongside anyone who applied here." />
      </div>
      <Importer slug={slug} programmeId={p.id} fields={p.form as FormField[]} tracks={p.tracks} />
    </div>
  );
}
