import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { withUser } from '@talentral/db';
import { WORK_MODES, type WorkMode } from '@talentral/domain';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { ClockBar, ShortlistBadge, stateOf, type ShortlistFields } from '@/components/work/shortlist-clock';
import { requirePlatformAdmin } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { Stat, TalentShell } from '../shell';

export const metadata = { title: 'Shortlist requests' };

type Row = { id: string; title: string; employer: string; work_mode: WorkMode; state: string | null; skills: string[];
  put_forward: number; said_yes: number; ready: number } & ShortlistFields;

// The talent team's queue: every shortlist an employer has asked for, the soonest due first, with
// how far each one has got. Sent shortlists from the last 30 days show whether they were on time.
export default async function ShortlistRequests() {
  const user = await requirePlatformAdmin();
  const rows = await withUser(user.id, (tx) => tx<Row[]>`
    select r.id, r.title, e.name as employer, r.work_mode, r.state, r.skills,
      r.shortlist_requested_at, r.shortlist_due_at, r.shortlist_sent_at,
      count(c.id)::int as put_forward,
      count(c.id) filter (where c.interest = 'confirmed')::int as said_yes,
      count(c.id) filter (where c.interest = 'confirmed' and c.stage <> 'declined' and p.employer_sharing)::int as ready
    from public.job_roles r join public.employers e on e.id = r.employer_id
    left join public.role_candidates c on c.role_id = r.id left join public.passports p on p.user_id = c.user_id
    where r.shortlist_requested_at is not null
      and (r.shortlist_sent_at is null or r.shortlist_sent_at < r.shortlist_requested_at or r.shortlist_sent_at > now() - interval '30 days')
    group by r.id, e.name order by r.shortlist_due_at`);
  const now = new Date();
  const open = rows.filter((r) => stateOf(r, now) !== 'sent');
  const sent = rows.filter((r) => stateOf(r, now) === 'sent');
  const onTime = sent.filter((r) => r.shortlist_sent_at && r.shortlist_due_at && new Date(r.shortlist_sent_at) <= new Date(r.shortlist_due_at)).length;

  return (
    <TalentShell user={user} active="requests">
      <PageHeader label="Talent officer console" title="Shortlist requests"
        description="Employers are promised a shortlist within three working days (Monday to Friday, West Africa Time). Put forward the best matches; each person answers from a one-tap link; send the shortlist from the role page." />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Waiting" value={open.length} />
        <Stat label="Due within a day" value={open.filter((r) => stateOf(r, now) === 'due_soon').length} />
        <Stat label="Overdue" value={open.filter((r) => stateOf(r, now) === 'overdue').length} />
        <Stat label="Sent on time, last 30 days" value={sent.length ? `${Math.round((onTime / sent.length) * 100)}%` : '–'} />
      </div>

      <h2 className="mb-3 text-lg font-semibold">Waiting</h2>
      {open.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nothing waiting">When an employer asks for a shortlist on a job, it appears here with its deadline.</EmptyState>
      ) : (
        <ul className="space-y-3" aria-label="Shortlists waiting">
          {open.map((r) => {
            const st = stateOf(r, now);
            return (
              <li key={r.id}>
                <Card className={st === 'overdue' ? 'border-danger/30 p-5' : 'p-5'}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/platform/talent/roles/${r.id}`} className="font-semibold hover:text-blue">{r.title}</Link>
                      <p className="text-sm text-muted">{r.employer} · {WORK_MODES[r.work_mode]}{r.state ? ` · ${r.state}` : ''}</p>
                    </div>
                    <ShortlistBadge state={st} due={r.shortlist_due_at} />
                  </div>
                  <div className="mt-3"><ClockBar requested={r.shortlist_requested_at!} due={r.shortlist_due_at!} now={now} /></div>
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                    <span>Due {formatDate(r.shortlist_due_at, true)}</span>
                    <span><b className="text-ink">{r.put_forward}</b> put forward</span>
                    <span><b className="text-ink">{r.said_yes}</b> said yes</span>
                    <span><b className="text-ink">{r.ready}</b> ready to send</span>
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {sent.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Sent in the last 30 days</h2>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Sent shortlists">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="border-b border-line bg-canvas/70 text-xs font-medium text-muted">
                  <tr><th className="px-5 py-2.5">Role</th><th className="px-4 py-2.5">Due</th><th className="px-4 py-2.5">Sent</th><th className="px-4 py-2.5">On time</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {sent.map((r) => {
                    const late = r.shortlist_sent_at && r.shortlist_due_at && new Date(r.shortlist_sent_at) > new Date(r.shortlist_due_at);
                    return (
                      <tr key={r.id}>
                        <td className="px-5 py-3"><Link href={`/platform/talent/roles/${r.id}`} className="font-medium hover:text-blue">{r.title}</Link><span className="block text-xs text-muted">{r.employer}</span></td>
                        <td className="px-4 py-3 tabular-nums">{formatDate(r.shortlist_due_at, true)}</td>
                        <td className="px-4 py-3 tabular-nums">{formatDate(r.shortlist_sent_at, true)}</td>
                        <td className="px-4 py-3">{late ? <span className="font-medium text-danger">Late</span> : <span className="font-medium text-teal-700">On time</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      )}
    </TalentShell>
  );
}
