import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import type { Mark } from '@talentral/domain';
import { PageHeader } from '@/components/ui';
import { canManage, hubAccess } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { hubUrl } from '@/lib/urls';
import { MODE_LABELS } from '../../../labels';
import { CheckinPanel, Register, type RegisterRow } from './register';

export const metadata = { title: 'Register' };

type Session = { id: string; title: string; starts_at: Date; ends_at: Date; mode: keyof typeof MODE_LABELS; location: string | null; facilitator: string | null;
  checkin_code: string; checkin_open: boolean; cohort_id: string; cohort: string };

export default async function SessionPage({ params }: { params: Promise<{ hub: string; id: string; sid: string }> }) {
  const { hub: slug, id, sid } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(sid)) notFound();
  const { user, hub, role } = await hubAccess(slug);
  const data = await withUser(user.id, async (tx) => {
    const [s] = await tx<Session[]>`
      select s.id, s.title, s.starts_at, s.ends_at, s.mode, s.location, s.facilitator, s.checkin_code, s.checkin_open, s.cohort_id, c.name as cohort
      from public.class_sessions s join public.cohorts c on c.id = s.cohort_id
      where s.id = ${sid} and s.cohort_id = ${id} and s.tenant_id = ${hub.id}`;
    if (!s) return null;
    const rows = await tx<(Omit<RegisterRow, 'mark'> & { mark: Mark | null })[]>`
      select e.id as enrolment_id, a.full_name, a.reference, at.status as mark, at.method
      from public.enrolments e join public.applications a on a.id = e.application_id
      left join public.attendance at on at.enrolment_id = e.id and at.session_id = ${sid}
      where e.cohort_id = ${id} and e.status <> 'dropped' order by a.full_name`;
    return { s, rows };
  });
  if (!data) notFound();
  const { s, rows } = data;

  return (
    <div className="max-w-3xl space-y-6">
      <Link href={`/dashboard/${slug}/cohorts/${id}`} className="text-sm font-semibold text-blue hover:underline">← {s.cohort}</Link>
      <PageHeader label="Register" title={s.title}
        description={`${formatDate(s.starts_at, true)} to ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }).format(new Date(s.ends_at))} · ${MODE_LABELS[s.mode]}${s.location ? ` · ${s.location}` : ''}${s.facilitator ? ` · ${s.facilitator}` : ''}`} />
      {canManage(role) && <CheckinPanel slug={slug} sessionId={s.id} code={s.checkin_code} open={s.checkin_open} url={hubUrl(hub.slug, '/checkin')} />}
      {rows.length === 0 ? <p className="text-sm text-muted">No learners in this cohort yet.</p> : <Register slug={slug} sessionId={s.id} rows={rows} />}
    </div>
  );
}
