import { Card, PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { NewProgrammeForm } from './new-form';

export const metadata = { title: 'New programme' };

export default async function NewProgramme({ params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  await requireHubRole(slug, ['owner', 'admin']);
  return (
    <div className="max-w-2xl">
      <PageHeader label="Programmes" title="New programme" description="Start with a title. You will add dates, tracks and the application form next." />
      <Card className="p-5 sm:p-6"><NewProgrammeForm slug={slug} /></Card>
    </div>
  );
}
