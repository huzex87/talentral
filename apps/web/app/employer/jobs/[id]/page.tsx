import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { CANDIDATE_STAGES, INTEREST, JOB_TYPES, WORK_MODES, matchTalent, payRange, type Interest, type WorkMode } from '@talentral/domain';
import { ReadinessBadge } from '@/components/talent-card';
import { Alert, Badge, Button, Card, PageHeader } from '@/components/ui';
import { requireEmployer } from '@/lib/employer';
import { formatDate } from '@/lib/format';
import { discoverableTalent } from '@/lib/talent-data';
import { recordRetention, setJobStatus } from '../../actions';
import { ApplicantForm, InviteButton } from '../../forms';
import { EmployerShell } from '../../shell';

export const metadata = { title: 'Job' };

type Job = { id: string; title: string; description: string | null; skills: string[]; work_mode: WorkMode; job_type: keyof typeof JOB_TYPES;
  state: string | null; pay_min: number | null; pay_max: number | null; openings: number; status: 'open' | 'filled' | 'closed' };
type Applicant = { id: string; user_id: string; name: string; headline: string | null; interest: Interest; stage: keyof typeof CANDIDATE_STAGES; notes: string | null;
  placement_type: string | null; start_date: string | null; pay_band: string | null; retained: boolean | null; retention_due: boolean };

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ posted?: string }> }) {
  const { user, employer } = await requireEmployer();
  const { id } = await params;
  const { posted } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await withUser(user.id, async (tx) => {
    const [job] = await tx<Job[]>`select * from public.job_roles where id = ${id} and employer_id = ${employer.id}`;
    if (!job) return null;
    const applicants = await tx<Applicant[]>`
      select c.id, c.user_id, coalesce(u.full_name, 'Candidate') as name, p.headline, c.interest, c.stage, c.notes, c.placement_type, c.start_date::text, c.pay_band,
        c.retained, (c.stage = 'placed' and c.retained is null and c.start_date <= current_date - 90) as retention_due
      from public.role_candidates c left join public.users u on u.id = c.user_id left join public.passports p on p.user_id = c.user_id
      where c.role_id = ${id} order by c.interest = 'confirmed' desc, c.created_at`;
    const contacts = new Map<string, { email: string; phone: string | null }>();
    for (const a of applicants.filter((x) => x.interest === 'confirmed')) {
      const [c] = await tx<{ email: string; phone: string | null }[]>`select * from app.candidate_contact(${a.id})`;
      if (c) contacts.set(a.id, c);
    }
    const talent = employer.status === 'verified' ? await discoverableTalent(tx, 'employer') : [];
    return { job, applicants, contacts, talent };
  });
  if (!data) notFound();
  const { job, applicants, contacts } = data;
  const onJob = new Set(applicants.map((a) => a.user_id));
  const matches = data.talent.filter((t) => !onJob.has(t.user_id))
    .map((t) => ({ t, m: matchTalent({ skills: job.skills, work_mode: job.work_mode, state: job.state }, t) }))
    .filter((x) => x.m.matched.length > 0)
    .sort((a, b) => b.m.score - a.m.score).slice(0, 20);
  const pay = payRange(job.pay_min, job.pay_max);
  const interested = applicants.filter((a) => a.interest === 'confirmed');
  const waiting = applicants.filter((a) => a.interest !== 'confirmed');

  return (
    <EmployerShell user={user} employer={employer}>
      <PageHeader label={<Link href="/employer" className="hover:underline">← Your jobs</Link>} title={job.title}
        description={`${WORK_MODES[job.work_mode]} · ${JOB_TYPES[job.job_type]}${job.state ? ` · ${job.state}` : ''} · ${job.openings} ${job.openings === 1 ? 'opening' : 'openings'}${pay ? ` · ${pay}` : ''}`}
        actions={employer.status === 'verified' && <>
          <Badge tone={job.status === 'open' ? 'teal' : 'neutral'}>{job.status === 'open' ? 'Open' : job.status === 'filled' ? 'Filled' : 'Closed'}</Badge>
          {(['open', 'filled', 'closed'] as const).filter((s) => s !== job.status).map((s) => (
            <form key={s} action={setJobStatus.bind(null, job.id, s)}><Button variant="ghost" size="sm">{s === 'open' ? 'Reopen' : s === 'filled' ? 'Mark filled' : 'Close'}</Button></form>
          ))}
        </>} />
      {posted && <div className="mb-6"><Alert tone="violet" title="Your job is live">Below are the people who best match it. Invite the ones you like; they decide whether to share their contact details.</Alert></div>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="text-lg font-semibold">Interested candidates</h2>
            <p className="mb-3 mt-1 text-sm text-muted">They said yes, so you can contact them. Record interviews, offers and hires here.</p>
            {interested.length === 0 ? <Card className="p-5 text-sm text-muted">Nobody yet. Invite people from your matches; you will see them here when they say yes.</Card> : (
              <ul className="space-y-3" aria-label="Interested candidates">
                {interested.map((a) => {
                  const c = contacts.get(a.id);
                  return (
                    <li key={a.id}>
                      <Card className="p-5">
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link href={`/employer/talent/${a.user_id}`} className="font-semibold hover:text-blue">{a.name}</Link>
                            {a.headline && <p className="text-sm text-muted">{a.headline}</p>}
                            {c && <p className="mt-1 text-sm"><a href={`mailto:${c.email}`} className="font-semibold text-blue hover:underline">{c.email}</a>{c.phone && <> · <a href={`tel:${c.phone}`} className="font-semibold text-blue hover:underline">{c.phone}</a></>}</p>}
                          </div>
                          <Badge tone={a.stage === 'placed' ? 'teal' : 'blue'}>{a.stage === 'placed' ? 'Hired' : CANDIDATE_STAGES[a.stage]}</Badge>
                        </div>
                        {a.retention_due ? (
                          <div className="rounded-xl border border-amber-800/20 bg-amber-50 p-4">
                            <p className="font-semibold text-amber-800">90-day check: is {a.name.split(' ')[0]} still working with you?</p>
                            <p className="mt-0.5 text-sm text-amber-800">Started {formatDate(a.start_date)}. Your answer helps the hub that trained them.</p>
                            <div className="mt-3 flex gap-2">
                              <form action={recordRetention.bind(null, a.id, true)}><Button size="sm">Yes, still with us</Button></form>
                              <form action={recordRetention.bind(null, a.id, false)}><Button size="sm" variant="secondary">No, they left</Button></form>
                            </div>
                          </div>
                        ) : a.retained !== null ? (
                          <p className="text-sm text-muted">90-day check: {a.retained ? 'still working with you.' : 'no longer with you.'}</p>
                        ) : <ApplicantForm c={a} />}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {job.status === 'open' && employer.status === 'verified' && (
            <section>
              <h2 className="text-lg font-semibold">Ranked matches</h2>
              <p className="mb-3 mt-1 text-sm text-muted">People who chose to be found by verified employers, ordered by fit. The reasons come first: matching recommends, you decide.</p>
              {matches.length === 0 ? <Card className="p-5 text-sm text-muted">{applicants.length ? 'You have invited everyone who currently matches. New people appear here as they finish training and open their Passports to employers.' : 'No one open to employer search lists these skills yet. Try broader skills, or the Talentral talent team can search for you.'}</Card> : (
                <ul className="space-y-3" aria-label="Ranked matches">
                  {matches.map(({ t, m }, i) => (
                    <li key={t.user_id}>
                      <Card className="p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="flex size-6 items-center justify-center rounded-full bg-canvas text-xs font-bold text-muted">{i + 1}</span>
                              <Link href={`/employer/talent/${t.user_id}`} className="font-semibold hover:text-blue">{t.full_name ?? 'Candidate'}</Link>
                              <ReadinessBadge level={t.readiness} />
                            </div>
                            {t.headline && <p className="mt-0.5 text-sm text-muted">{t.headline}{t.state ? ` · ${t.state}` : ''}</p>}
                            <ul className="mt-2 space-y-0.5 text-sm">
                              {m.reasons.map((r) => <li key={r} className="flex gap-2"><span aria-hidden className="text-teal-700">✓</span>{r}</li>)}
                              {m.concerns.map((r) => <li key={r} className="flex gap-2 text-muted"><span aria-hidden className="text-amber-800">!</span>{r}</li>)}
                            </ul>
                          </div>
                          <InviteButton jobId={job.id} userId={t.user_id} name={t.full_name ?? 'candidate'} />
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {waiting.length > 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">Invited</h2>
              <ul className="mt-3 space-y-2 text-sm" aria-label="Invited">
                {waiting.map((a) => <li key={a.id} className="flex items-center justify-between gap-2"><span className="truncate">{a.name}</span><Badge tone={a.interest === 'declined' ? 'neutral' : 'amber'}>{INTEREST[a.interest]}</Badge></li>)}
              </ul>
            </Card>
          )}
          <Card className="p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">Required skills</h2>
            <ul className="mt-3 flex flex-wrap gap-1.5">{job.skills.map((s) => <li key={s}><Badge tone="blue">{s}</Badge></li>)}</ul>
            {job.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{job.description}</p>}
          </Card>
        </aside>
      </div>
    </EmployerShell>
  );
}
