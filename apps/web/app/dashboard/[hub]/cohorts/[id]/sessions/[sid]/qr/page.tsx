import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { TalentralLogo } from '@/components/logo';
import { hubAccess } from '@/lib/auth';
import { sessionQr } from '../../../../actions';
import { QrScreen } from './qr-screen';

export const metadata = { title: 'Check-in screen' };

export default async function QrPage({ params }: { params: Promise<{ hub: string; id: string; sid: string }> }) {
  const { hub: slug, id, sid } = await params;
  if (!/^[0-9a-f-]{36}$/.test(sid)) notFound();
  const { user, hub } = await hubAccess(slug);
  const [s] = await withUser(user.id, (tx) => tx<{ title: string; checkin_code: string; cohort: string }[]>`
    select s.title, s.checkin_code, c.name as cohort from public.class_sessions s join public.cohorts c on c.id = s.cohort_id
    where s.id = ${sid} and s.tenant_id = ${hub.id}`);
  const qr = s ? await sessionQr(slug, sid) : null;
  if (!s || !qr) notFound();
  return (
    <main id="main" tabIndex={-1} className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 overflow-auto bg-midnight p-6 text-center">
      <div className="absolute left-5 top-5"><TalentralLogo dark height={24} href={null} /></div>
      <Link href={`/dashboard/${slug}/cohorts/${id}/sessions/${sid}`} className="absolute right-5 top-5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white">Close</Link>
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-teal">{hub.name} · {s.cohort}</p>
        <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">{s.title}</h1>
        <p className="mt-2 text-lg text-white/80">Scan with your phone camera to check in</p>
      </div>
      <QrScreen slug={slug} sessionId={sid} initial={qr} />
      <p className="text-sm text-white/60">No camera? Use the class code <b className="font-mono text-lg tracking-[0.2em] text-white">{s.checkin_code}</b> on the check-in page.</p>
    </main>
  );
}
