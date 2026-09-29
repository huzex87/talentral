import Link from 'next/link';
import { withUser } from '@talentral/db';
import { LearnerShell } from '@/components/learner-shell';
import { requireUser } from '@/lib/auth';
import { translator } from '@/lib/i18n';

export const metadata = { title: 'Check in' };
export const dynamic = 'force-dynamic';

// Opened by scanning the room's QR code.
export default async function QrCheckin({ params, searchParams }: { params: Promise<{ session: string }>; searchParams: Promise<{ t?: string }> }) {
  const { session } = await params;
  const { t: token } = await searchParams;
  const user = await requireUser();
  const language = user.language;
  const t = translator(language);
  const ERRORS: Record<string, string> = {
    P0001: t('This code has expired. Scan the screen again.', 'Wannan lambar ta daina aiki. Sake duba allon da waya.'),
    P0002: t('You are not in this cohort.', 'Ba ka cikin wannan rukunin.'),
    P0003: t('Check-in is closed for this session.', 'An rufe rajista na wannan ajin.'),
  };
  const result = await withUser(user.id, async (tx) => {
    if (!/^[0-9a-f-]{36}$/.test(session) || !token || !/^[0-9a-f]{10}$/.test(token)) return { error: ERRORS.P0001! };
    try {
      const [r] = await tx.savepoint((sp) => sp<{ session_title: string; status: string }[]>`select * from app.qr_checkin(${session}, ${token})`);
      return { ok: r! };
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (ERRORS[code]) return { error: ERRORS[code] };
      throw e;
    }
  });
  const first = (user.full_name ?? '').split(' ')[0];
  return (
    <LearnerShell user={user} language={language} active="learn">
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
