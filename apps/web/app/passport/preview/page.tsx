import { withUser } from '@talentral/db';
import { TalentCard } from '@/components/talent-card';
import { TopBar } from '@/components/top-bar';
import { Alert, LinkButton, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { EMPTY_PASSPORT, loadPassport, toTalentCard } from '@/lib/passport-data';

export const metadata = { title: 'Passport preview' };

export default async function PassportPreview() {
  const user = await requireUser();
  const { passport, learning, readiness, evidence } = await withUser(user.id, (tx) => loadPassport(tx, user.id));
  const p = passport ?? { ...EMPTY_PASSPORT, user_id: user.id };
  return (
    <div className="min-h-dvh">
      <TopBar user={user} />
      <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader label="Preview" title="What employers see" description="Employers see this only for jobs you say yes to, and only while sharing with employers is on. They never see your email, phone number, town or city."
          actions={<LinkButton variant="secondary" href="/passport">Back to your Passport</LinkButton>} />
        {!p.employer_sharing && <div className="mb-4"><Alert tone="amber">Sharing with employers is off, so no employer can see this right now.</Alert></div>}
        <TalentCard t={toTalentCard(user.full_name ?? user.email, p, learning, readiness, evidence)} />
      </main>
    </div>
  );
}
