import { Alert, PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { logoUrl, coverUrl } from '@/lib/hubs';
import { ProfileForm } from './profile-form';

export const metadata = { title: 'Hub profile' };

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ hub: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { hub: slug } = await params;
  const { welcome } = await searchParams;
  const { hub } = await requireHubRole(slug, ['owner', 'admin']);
  return (
    <div className="max-w-3xl">
      <PageHeader label="Settings" title="Hub profile" description="This is what applicants see on your hub page. You can change it at any time." />
      {welcome && <div className="mb-6"><Alert tone="violet" title={`Welcome to Talentral, ${hub.name}`}>Start by completing your profile: add your logo, a tagline, a short description and a contact email. Then create your first call for applications.</Alert></div>}
      {!hub.profile_completed_at && !welcome && <div className="mb-6"><Alert tone="amber" title="Your profile is incomplete">Add a logo, tagline, description and contact email to publish your hub page and open applications.</Alert></div>}
      <ProfileForm hub={hub} logo={logoUrl(hub)} cover={coverUrl(hub)} />
    </div>
  );
}
