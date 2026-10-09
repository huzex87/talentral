import { Megaphone } from 'lucide-react';
import { withUser } from '@talentral/db';
import { CreateScreen } from '@/components/create-screen';
import { EmptyState, LinkButton } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { NewCohortForm } from '../new-cohort-form';

export const metadata = { title: 'New cohort' };

export default async function NewCohort({ params, searchParams }: { params: Promise<{ hub: string }>; searchParams: Promise<{ programme?: string }> }) {
  const { hub: slug } = await params;
  const { programme } = await searchParams;
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const programmes = await withUser(user.id, (tx) => tx<{ id: string; title: string; accepted: number }[]>`
    select p.id, p.title, (select count(*)::int from public.applications a where a.programme_id = p.id and a.status = 'accepted') as accepted
    from public.programmes p where p.tenant_id = ${hub.id} order by p.created_at desc`);
  return (
    <CreateScreen back={`/dashboard/${slug}/cohorts`} backLabel="Cohorts" label="Deliver" title="New cohort"
      description="A cohort is one group of learners on a programme, with its own dates, timetable and register."
      next={['Add everyone you accepted in one click, with a welcome email.', 'Choose the course they follow and plan classes.', 'Take attendance, grade work and issue certificates.']}>
      {programmes.length ? <NewCohortForm slug={slug} programmes={programmes} defaultProgramme={programme} />
        : <EmptyState icon={Megaphone} title="Create a programme first" action={<LinkButton href={`/dashboard/${slug}/programmes/new`}>New programme</LinkButton>}>Cohorts belong to a programme, so learners can be admitted from its applications.</EmptyState>}
    </CreateScreen>
  );
}
