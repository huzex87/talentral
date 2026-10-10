import { CreateScreen } from '@/components/create-screen';
import { requireHubRole } from '@/lib/auth';
import { NewProgrammeForm } from './new-form';

export const metadata = { title: 'New programme' };

export default async function NewProgramme({ params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  await requireHubRole(slug, ['owner', 'admin']);
  return (
    <CreateScreen back={`/dashboard/${slug}/programmes`} backLabel="Programmes" label="Programmes" title="New programme"
      description="A programme is one call for applications, such as a bootcamp or a fellowship. Start with a title."
      next={['Add dates, tracks and the application form.', 'Publish its page and share the link to start receiving applications.', 'Score, shortlist and accept applicants, then admit them to a cohort.']}>
      <NewProgrammeForm slug={slug} />
    </CreateScreen>
  );
}
