import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import {
  CANDIDATE_STAGES, INTEREST, JOB_STATUS_LABELS, JOB_TYPES, SOURCE_LABELS, WORK_MODES, closingLabel, matchTalent, payRange, rankApplicants, retentionDueOn, retentionState,
  watToday, type ApplicationSource, type Interest, type JobStatus, type WorkMode,
} from '@talentral/domain';
import { ReadinessBadge } from '@/components/talent-card';
import { Alert, Badge, Button, Card, PageHeader } from '@/components/ui';
import { requireEmployer } from '@/lib/employer';
import { formatDate } from '@/lib/format';
import { discoverableTalent } from '@/lib/talent-data';
import { confirmHire, recordRetention, requestShortlist, setJobStatus } from '../../actions';
import { ClockBar, ShortlistBadge, stateOf, type ShortlistFields } from '@/components/work/shortlist-clock';
import { SubmitButton } from '@/components/submit-button';
import { ApplicantForm, InviteButton, JobForm } from '../../forms';
import { EmployerShell } from '../../shell';

export const metadata = { title: 'Job' };

type Job = { id: string; title: string; description: string | null; skills: string[]; work_mode: WorkMode; job_type: keyof typeof JOB_TYPES;
  state: string | null; pay_min: number | null; pay_max: number | null; openings: number; status: JobStatus;
  requirements: string | null; closes_on: string | null; on_board: boolean; published_at: Date | null } & ShortlistFields;
type Applicant = { id: string; user_id: string; name: string; headline: string | null; interest: Interest; stage: keyof typeof CANDIDATE_STAGES; notes: string | null;
  placement_type: string | null; start_date: string | null; pay_band: string | null; retained: boolean | null; retention_due: boolean;
  source: ApplicationSource; cover_note: string | null; applied_at: Date | null; created_at: Date; match_score: number | null; match_reasons: string[]; match_concerns: string[];
  placement_confirmed_at: Date | null; placement_confirmation: 'employer' | 'officer' | null };

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ posted?: string; draft?: string }> }) {
  const { user, employer } = await requireEmployer();
  const { id } = await params;
  const { posted, draft } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await withUser(user.id, async (tx) => {
    const [job] = await tx<Job[]>`select *, closes_on::text as closes_on from public.job_roles where id = ${id} and employer_id = ${employer.id}`;
    if (!job) return null;
    const applicants = await tx<Applicant[]>`
      select c.id, c.user_id, coalesce(u.full_name, 'Candidate') as name, p.headline, c.interest, c.stage, c.notes, c.placement_type, c.start_date::text, c.pay_band,
        c.retained, (c.stage = 'placed' and c.retained is null and c.start_date <= current_date - 90) as retention_due,
        c.source, c.cover_note, c.applied_at, c.created_at, c.match_score, c.match_reasons, c.match_concerns, c.placement_confirmed_at, c.placement_confirmation
      from public.role_candidates c left join public.users u on u.id = c.user_id left join public.passports p on p.user_id = c.user_id
      where c.role_id = ${id} order by c.interest = 'confirmed' desc, c.created_at`;
    const contacts = new Map<string, { email: string; phone: string | null }>();
    for (const a of applicants.filter((x) => x.interest === 'confirmed')) {
      const [c] = await tx<{ email: string; phone: string | null }[]>`select * from app.candidate_contact(${a.id})`;
      if (c) contacts.set(a.id, c);
    }
    const talent = employer.status === 'verified' ? await discoverableTalent(tx, 'employer') : [];
    const skills = await tx<{ name: string; track: string }[]>`select name, track from public.skills where tenant_id is null order by track, name`;
    return { job, applicants, contacts, talent, skills };
  });
  if (!data) notFound();
  const { job, applicants, contacts } = data;
  const onJob = new Set(applicants.map((a) => a.user_id));
  const matches = data.talent.filter((t) => !onJob.has(t.user_id))
    .map((t) => ({ t, m: matchTalent({ skills: job.skills, work_mode: job.work_mode, state: job.state }, t) }))
    .filter((x) => x.m.matched.length > 0)
    .sort((a, b) => b.m.score - a.m.score).slice(0, 20);
  const pay = payRange(job.pay_min, job.pay_max);
  // Hires first, then everyone still in the running by match, then those not selected.
  const confirmed = applicants.filter((a) => a.interest === 'confirmed');
  const interested = [
    ...confirmed.filter((a) => a.stage === 'placed'),
    ...rankApplicants(confirmed.filter((a) => a.stage !== 'placed' && a.stage !== 'declined')),
    ...confirmed.filter((a) => a.stage === 'declined'),
  ];
  const today = watToday(new Date());
  const isNew = (a: Applicant) => a.source === 'applied' && a.stage === 'shortlisted' && a.applied_at && Date.now() - new Date(a.applied_at).getTime() < 3 * 86_400_000;
  const waiting = applicants.filter((a) => a.interest !== 'confirmed');

  return (
    <EmployerShell user={user} employer={employer}>
      <PageHeader label={<Link href="/employer" className="hover:underline">← Your jobs</Link>} title={job.title}
        description={`${WORK_MODES[job.work_mode]} · ${JOB_TYPES[job.job_type]}${job.state ? ` · ${job.state}` : ''} · ${job.openings} ${job.openings === 1 ? 'opening' : 'openings'}${pay ? ` · ${pay}` : ''}`}
        actions={employer.status === 'verified' && <>
          <Badge tone={job.status === 'open' ? 'teal' : job.status === 'draft' ? 'amber' : 'neutral'}>{JOB_STATUS_LABELS[job.status]}</Badge>
          {job.status !== 'draft' && (['open', 'filled', 'closed'] as const).filter((s) => s !== job.status).map((s) => (
            <form key={s} action={setJobStatus.bind(null, job.id, s)}><Button variant="ghost" size="sm">{s === 'open' ? 'Reopen' : s === 'filled' ? 'Mark filled' : 'Close'}</Button></form>
          ))}
        </>} />
      {posted && <div className="mb-6"><Alert tone="violet" title="Your job is live">{job.on_board ? 'Learners can find it on the Talentral jobs board. ' : ''}Below are the people who best match it. Invite the ones you like; they decide whether to share their contact details.</Alert></div>}
      {draft && job.status === 'draft' && <div className="mb-6"><Alert tone="amber" title="Draft saved">Only your team can see it. Check the details below and publish when you are ready; the matches show who would fit.</Alert></div>}
      <p className="-mt-2 mb-6 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <span>{job.status === 'draft' ? 'Not published yet' : job.on_board ? <>On the jobs board · <Link href={`/jobs/${job.id}`} className="font-semibold text-blue hover:underline">see it as learners do ↗</Link></> : 'By invitation only (not on the jobs board)'}</span>
        {job.closes_on && <span>{closingLabel(job.closes_on, watToday(new Date()))}</span>}
        {job.published_at && <span>Published {formatDate(job.published_at)}</span>}
      </p>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="text-lg font-semibold">Applicants and candidates</h2>
            <p className="mb-3 mt-1 text-sm text-muted">People who applied or said yes to your invitation, best match first, with the reasons. You can contact them; record interviews, offers and hires here and we let them know.</p>
            {interested.length === 0 ? <Card className="p-5 text-sm text-muted">Nobody yet. {job.on_board && job.status === 'open' ? 'Learners can apply from the jobs board, and you can invite people from your matches.' : 'Invite people from your matches; you will see them here when they say yes.'}</Card> : (
              <ul className="space-y-3" aria-label="Interested candidates">
                {interested.map((a) => {
                  const c = contacts.get(a.id);
                  const retention = retentionState(a, today);
                  return (
                    <li key={a.id}>
                      <Card className={a.stage === 'declined' ? 'bg-canvas/40 p-5' : 'p-5'}>
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link href={`/employer/talent/${a.user_id}`} className="font-semibold hover:text-blue">{a.name}</Link>
                              <Badge tone={a.source === 'applied' ? 'blue' : 'neutral'}>{SOURCE_LABELS[a.source]}</Badge>
                              {isNew(a) && <Badge tone="violet">New</Badge>}
                            </div>
                            {a.headline && <p className="text-sm text-muted">{a.headline}</p>}
                            {c && <p className="mt-1 text-sm"><a href={`mailto:${c.email}`} className="font-semibold text-blue hover:underline">{c.email}</a>{c.phone && <> · <a href={`tel:${c.phone}`} className="font-semibold text-blue hover:underline">{c.phone}</a></>}</p>}
                            {a.applied_at && <p className="mt-0.5 text-xs text-muted">Applied {formatDate(a.applied_at)}</p>}
                          </div>
                          <Badge tone={a.stage === 'placed' ? 'teal' : a.stage === 'declined' ? 'neutral' : 'blue'}>{a.stage === 'placed' ? 'Hired' : a.stage === 'declined' ? 'Not selected' : a.stage === 'shortlisted' ? 'Reviewing' : CANDIDATE_STAGES[a.stage]}</Badge>
                        </div>
                        {a.stage !== 'placed' && (a.match_reasons.length > 0 || a.cover_note) && (
                          <div className="mb-3 space-y-2 rounded-xl bg-canvas p-3 text-sm">
                            {a.match_reasons.length > 0 && (
                              <ul className="space-y-0.5" aria-label={`Why ${a.name} may fit`}>
                                {a.match_reasons.map((r) => <li key={r} className="flex gap-2"><span aria-hidden className="text-teal-700">✓</span>{r}</li>)}
                                {a.match_concerns.map((r) => <li key={r} className="flex gap-2 text-muted"><span aria-hidden className="text-amber-800">!</span>{r}</li>)}
                              </ul>
                            )}
                            {a.cover_note && <p className="whitespace-pre-line border-l-2 border-blue/30 pl-3 italic">“{a.cover_note}”</p>}
                          </div>
                        )}
                        {a.stage === 'placed' && !a.placement_confirmed_at && (
                          <div className="mb-3 rounded-xl border border-violet/20 bg-violet-50 p-4">
                            <p className="font-semibold text-violet">Please confirm this hire</p>
                            <p className="mt-0.5 text-sm text-violet">The Talentral talent team recorded that you hired {a.name.split(' ')[0]}{a.start_date ? `, starting ${formatDate(a.start_date)}` : ''}. If that is right, confirm it; if not, correct the details below.</p>
                            <form action={confirmHire.bind(null, a.id)} className="mt-3"><Button size="sm">Confirm the hire</Button></form>
                          </div>
                        )}
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
                        ) : (
                          <>
                            {a.stage === 'placed' && a.placement_confirmed_at && a.start_date && retention === 'not_due' && (
                              <p className="mb-3 text-sm text-muted">Hire confirmed {formatDate(a.placement_confirmed_at)}. We will ask you for a 90-day check on {formatDate(retentionDueOn(a.start_date))}.</p>
                            )}
                            <ApplicantForm c={a} />
                          </>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {(job.status === 'open' || job.status === 'draft') && employer.status === 'verified' && (
            <section>
              <h2 className="text-lg font-semibold">{job.status === 'draft' ? 'Who would match' : 'Ranked matches'}</h2>
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
                          {job.status === 'open' ? <InviteButton jobId={job.id} userId={t.user_id} name={t.full_name ?? 'candidate'} /> : <span className="text-xs text-muted">Publish to invite</span>}
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
          {employer.status === 'verified' && job.status === 'open' && (() => {
            const st = stateOf(job);
            return (
              <Card className="p-5" role="region" aria-labelledby="shortlist-h">
                <div className="flex items-start justify-between gap-2">
                  <h2 id="shortlist-h" className="text-sm font-semibold text-ink">Shortlist from Talentral</h2>
                  {st !== 'none' && <ShortlistBadge state={st} />}
                </div>
                {st === 'none' && (
                  <>
                    <p className="mt-2 text-sm text-muted">Our talent team sends you people with verified skills who have already said yes, within three working days.</p>
                    <form action={requestShortlist.bind(null, job.id)} className="mt-4"><SubmitButton className="w-full" pendingLabel="Asking…">Ask for a shortlist</SubmitButton></form>
                  </>
                )}
                {(st === 'on_track' || st === 'due_soon' || st === 'overdue') && job.shortlist_requested_at && job.shortlist_due_at && (
                  <>
                    <p className="mt-2 text-sm">Due by <b>{formatDate(job.shortlist_due_at, true)}</b></p>
                    <div className="mt-2"><ClockBar requested={job.shortlist_requested_at} due={job.shortlist_due_at} /></div>
                    <p className="mt-3 text-sm text-muted">We are contacting the best matches now. Each person says yes before you see them; they will appear under Applicants and candidates.</p>
                  </>
                )}
                {st === 'sent' && job.shortlist_sent_at && (
                  <>
                    <p className="mt-2 text-sm">Sent {formatDate(job.shortlist_sent_at, true)}. The people who said yes are listed under Applicants and candidates.</p>
                    <form action={requestShortlist.bind(null, job.id)} className="mt-4"><SubmitButton variant="secondary" className="w-full" pendingLabel="Asking…">Ask for more candidates</SubmitButton></form>
                  </>
                )}
              </Card>
            );
          })()}
          {waiting.length > 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-ink">Invited</h2>
              <ul className="mt-3 space-y-2 text-sm" aria-label="Invited">
                {waiting.map((a) => <li key={a.id} className="flex items-center justify-between gap-2"><span className="truncate">{a.name}</span><Badge tone={a.interest === 'declined' ? 'neutral' : 'amber'}>{INTEREST[a.interest]}</Badge></li>)}
              </ul>
            </Card>
          )}
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Required skills</h2>
            <ul className="mt-3 flex flex-wrap gap-1.5">{job.skills.map((s) => <li key={s}><Badge tone="blue">{s}</Badge></li>)}</ul>
            {job.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">{job.description}</p>}
            {job.requirements && <><h3 className="mt-4 text-sm font-semibold text-ink">Requirements</h3><p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{job.requirements}</p></>}
          </Card>
        </aside>
      </div>
      {employer.status === 'verified' && job.status !== 'closed' && job.status !== 'filled' && (
        <Card className="mt-6 p-5 sm:p-6">
          <details open={job.status === 'draft'}>
            <summary className="cursor-pointer text-lg font-semibold">{job.status === 'draft' ? 'Finish and publish' : 'Edit job'}</summary>
            <div className="mt-4"><JobForm skills={data.skills} job={{ ...job, closes_on: job.closes_on }} /></div>
          </details>
        </Card>
      )}
    </EmployerShell>
  );
}
