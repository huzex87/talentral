import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { TalentCard } from '@/components/talent-card';
import { PageHeader } from '@/components/ui';
import { requireVerifiedEmployer } from '@/lib/employer';
import { loadPassport, toTalentCard } from '@/lib/passport-data';
import { EmployerShell } from '../../shell';

export const metadata = { title: 'Candidate', robots: { index: false } };

// A candidate's Passport as an employer may see it. Row-Level Security decides: open to employer
// search, or they said yes to one of this employer's jobs with sharing on.
export default async function Candidate({ params }: { params: Promise<{ id: string }> }) {
  const { user, employer } = await requireVerifiedEmployer();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await withUser(user.id, async (tx) => {
    const loaded = await loadPassport(tx, id);
    if (!loaded.passport) return null;
    const [u] = await tx<{ full_name: string | null }[]>`select full_name from public.users where id = ${id}`;
    return { ...loaded, name: u?.full_name ?? 'Candidate' };
  });
  if (!data) notFound();
  return (
    <EmployerShell user={user} employer={employer}>
      <PageHeader label={<Link href="/employer" className="hover:underline">← Your jobs</Link>} title={data.name} description="Their Passport, as they chose to share it." />
      <div className="max-w-3xl"><TalentCard t={toTalentCard(data.name, data.passport!, data.learning, data.readiness, data.evidence)} /></div>
    </EmployerShell>
  );
}
