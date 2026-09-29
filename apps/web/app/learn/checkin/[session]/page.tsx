import Link from 'next/link';
import { withUser } from '@talentral/db';
import { LearnerShell } from '@/components/learner-shell';
import { requireUser } from '@/lib/auth';
import { learnerLanguage } from '@/lib/learn-data';

export const metadata = { title: 'Check in' };
export const dynamic = 'force-dynamic';

// Opened by scanning the room's QR code.
export default async function QrCheckin({ params, searchParams }: { params: Promise<{ session: string }>; searchParams: Promise<{ t?: string }> }) {
  const { session } = await params;
  const { t: token } = await searchParams;
  const user = await requireUser();
  const result = await withUser(user.id, async (tx) => {
    const language = await learnerLanguage(tx, user.id);
    if (!/^[0-9a-f-]{36}$/.test(session) || !token || !/^[0-9a-f]{10}$/.test(token)) return { language, error: 'This code is not valid. Scan the screen again.' };
    try {
      const [r] = await tx.savepoint((sp) => sp<{ session_title: string; status: string }[]>`select * from app.qr_checkin(${session}, ${token})`);
      return { language, ok: r! };
    } catch (e) {
      return { language, error: (e as Error).message };
    }
  });
  const t = (en: string, ha: string) => (result.language === 'ha' ? ha : en);
  const first = (user.full_name ?? '').split(' ')[0];
  return (
    <LearnerShell user={user} language={result.language} active="learn">
      <div className="mx-auto max-w-md py-8 text-center">
        {'ok' in result && result.ok ? (
          <div className="rounded-[var(--radius-card)] border border-teal-700/20 bg-white p-8 shadow-[var(--shadow-card)]" role="status">
            <span aria-hidden className="mx-auto flex size-16 items-center justify-center rounded-full bg-teal-700 text-3xl text-white">✓</span>
            <h1 className="mt-4 text-2xl font-semibold">{t(`You're checked in${first ? `, ${first}` : ''}`, `An yi maka rajista${first ? `, ${first}` : ''}`)}</h1>
            <p className="mt-2 text-muted">{result.ok.session_title}</p>
            <p className="mt-3 inline-block rounded-full bg-teal-50 px-3 py-1 text-sm font-bold text-teal-700">{result.ok.status === 'late' ? t('Marked late', 'An rubuta ka makara') : t('Marked present', 'An rubuta kana nan')}</p>
          </div>
        ) : (
          <div className="rounded-[var(--radius-card)] border border-amber-800/20 bg-white p-8 shadow-[var(--shadow-card)]" role="alert">
            <h1 className="text-2xl font-semibold">{t('Check-in did not work', 'Rajistar ba ta yi ba')}</h1>
            <p className="mt-2 text-muted">{'error' in result ? result.error : ''}</p>
          </div>
        )}
        <Link href="/learn" className="mt-6 inline-block text-sm font-semibold text-blue hover:underline">{t('Go to My learning', 'Je zuwa Karatuna')}</Link>
      </div>
    </LearnerShell>
  );
}
