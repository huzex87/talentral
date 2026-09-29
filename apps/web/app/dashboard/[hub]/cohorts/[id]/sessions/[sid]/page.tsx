import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import type { Mark } from '@talentral/domain';
import { Card, LinkButton, PageHeader } from '@/components/ui';
import { canManage, hubAccess } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { hubUrl } from '@/lib/urls';
import { MODE_LABELS } from '../../../labels';
import { ConfirmRegister, SessionLinksForm } from './live-panel';
import { CheckinPanel, Register, type RegisterRow } from './register';

export const metadata = { title: 'Register' };

type Session = { id: string; title: string; starts_at: Date; ends_at: Date; mode: keyof typeof MODE_LABELS; location: string | null; facilitator: string | null;
  checkin_code: string; checkin_open: boolean; cohort_id: string; cohort: string; meeting_url: string | null; recording_url: string | null;
  attendance_confirmed_at: Date | null; joins: number };

export default async function SessionPage({ params }: { params: Promise<{ hub: string; id: string; sid: string }> }) {
  const { hub: slug, id, sid } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(sid)) notFound();
  const { user, hub, role } = await hubAccess(slug);
  const data = await withUser(user.id, async (tx) => {
    const [s] = await tx<Session[]>`
      select s.id, s.title, s.starts_at, s.ends_at, s.mode, s.location, s.facilitator, s.checkin_code, s.checkin_open, s.cohort_id, c.name as cohort,
        s.meeting_url, s.recording_url, s.attendance_confirmed_at, (select count(distinct j.enrolment_id)::int from public.session_joins j where j.session_id = s.id) as joins
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
      <div className="grid gap-4 md:grid-cols-2">
        {s.mode !== 'online' && (
          <Card className="p-5">
            <h2 className="font-semibold">In the room</h2>
            <p className="mb-3 mt-1 text-sm text-muted">Put the check-in screen on a projector or laptop. The QR code changes every minute, so a photo shared elsewhere stops working.</p>
            <LinkButton href={`/dashboard/${slug}/cohorts/${id}/sessions/${s.id}/qr`} variant="secondary">Show check-in QR</LinkButton>
          </Card>
        )}
        {s.mode !== 'in_person' && (
          <Card className="p-5">
            <h2 className="font-semibold">Online</h2>
            <p className="mt-1 text-sm text-muted">{s.meeting_url ? `${s.joins} ${s.joins === 1 ? 'learner has' : 'learners have'} joined from Talentral.` : 'Add the meeting link so learners can join from My learning.'}</p>
          </Card>
        )}
      </div>
      {canManage(role) && (
        <Card className="p-5"><SessionLinksForm slug={slug} sessionId={s.id} meetingUrl={s.meeting_url} recordingUrl={s.recording_url} /></Card>
      )}
      {canManage(role) && <CheckinPanel slug={slug} sessionId={s.id} code={s.checkin_code} open={s.checkin_open} url={hubUrl(hub.slug, '/checkin')} />}
      <Card className="p-5">
        <h2 className="mb-2 font-semibold">Confirm the register</h2>
        <ConfirmRegister slug={slug} sessionId={s.id} started={new Date(s.starts_at) <= new Date()} confirmedAt={s.attendance_confirmed_at ? formatDate(s.attendance_confirmed_at, true) : null} />
      </Card>
      {rows.length === 0 ? <p className="text-sm text-muted">No learners in this cohort yet.</p> : <Register slug={slug} sessionId={s.id} rows={rows} />}
    </div>
  );
}
