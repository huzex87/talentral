import Link from 'next/link';
import { withUser } from '@talentral/db';
import { INTEREST, JOB_TYPES, READINESS, READINESS_RULES, WORK_MODES, passportGaps, payRange, type Interest, type Readiness } from '@talentral/domain';
import { EvidenceLabel, ReadinessBadge, bestEvidence } from '@/components/talent-card';
import { LearnerShell } from '@/components/learner-shell';
import { learnerLanguage } from '@/lib/learn-data';
import { Badge, Card, LinkButton, cx } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { EMPTY_PASSPORT, loadPassport } from '@/lib/passport-data';
import { ConsentSwitch, InterestButtons } from './controls';
import { PassportForm } from './passport-form';

export const metadata = { title: 'Your Passport' };

type Opportunity = { id: string; role_title: string; employer_name: string; description: string | null; work_mode: keyof typeof WORK_MODES;
  job_type: keyof typeof JOB_TYPES; state: string | null; pay_min: number | null; pay_max: number | null; interest: Interest;
  stage: string; created_at: Date; employer_views: string; last_viewed_at: Date | null; invited_by_employer: boolean };

const STATUS: Record<string, [string, 'teal' | 'blue' | 'neutral']> = { active: ['In training', 'blue'], completed: ['Completed', 'teal'], dropped: ['Withdrawn', 'neutral'] };

export default async function PassportPage() {
  const user = await requireUser();
  const data = await withUser(user.id, async (tx) => {
    const loaded = await loadPassport(tx, user.id);
    const opportunities = await tx<Opportunity[]>`select * from app.my_opportunities()`;
    const consents = await tx<{ kind: string; granted: boolean; at: Date }[]>`select kind, granted, at from public.consent_events order by at desc limit 8`;
    const tracks = [...new Set(loaded.learning.map((l) => l.track?.toLowerCase()).filter((t): t is string => Boolean(t)))];
    const suggestions = (await tx<{ name: string }[]>`
      select name from public.skills where tenant_id is null and (cardinality(${tracks}::text[]) = 0 or lower(track) = any(${tracks}::text[]))
      order by lower(track) = any(${tracks}::text[]) desc, name limit 24`).map((r) => r.name);
    return { ...loaded, opportunities, consents, suggestions, language: await learnerLanguage(tx, user.id) };
  });
  const p = data.passport ?? { ...EMPTY_PASSPORT, user_id: user.id };
  const gaps = passportGaps(p);
  const first = (user.full_name ?? '').split(' ')[0];
  const done = 4 - gaps.length;

  return (
    <LearnerShell user={user} language={data.language} active="passport">
        {/* Header */}
        <section className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(50%_80%_at_100%_0%,rgba(124,58,237,0.09),transparent),radial-gradient(40%_70%_at_0%_100%,rgba(20,184,166,0.08),transparent)]" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">Talentral Passport</p>
              <h1 className="mt-1 text-3xl font-semibold leading-tight">{user.full_name ?? 'Your Passport'}</h1>
              <p className="mt-1 text-[15px] text-muted">{p.headline ?? 'Add a headline so people know the work you do.'}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ReadinessBadge level={data.readiness} />
                {p.discoverable ? <Badge tone="teal">Visible to talent officers</Badge> : <Badge tone="neutral">Private</Badge>}
                {p.state && <span className="text-sm text-muted">{p.state}</span>}
              </div>
            </div>
            <LinkButton variant="secondary" href="/passport/preview">See what employers see</LinkButton>
          </div>
        </section>

        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-6">
            {gaps.length > 0 && (
              <Card className="border-violet/25 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">{first ? `${first}, finish` : 'Finish'} your Passport to be found</h2>
                  <span className="text-sm font-semibold text-violet">{done} of 4</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-violet-50"><div className="h-full rounded-full bg-violet" style={{ width: `${(done / 4) * 100}%` }} /></div>
                <ul className="mt-4 space-y-1.5 text-sm">{gaps.map((g) => <li key={g} className="flex gap-2"><span aria-hidden className="text-violet">○</span>{g}</li>)}</ul>
              </Card>
            )}

            {data.opportunities.length > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-semibold">Opportunities</h2>
                <div className="space-y-3">
                  {data.opportunities.map((o) => {
                    const pay = payRange(o.pay_min, o.pay_max);
                    return (
                      <Card key={o.id} className={cx('p-5', o.interest === 'pending' && 'border-blue/40 ring-4 ring-blue/5')}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-display text-lg font-semibold">{o.role_title}</p>
                            <p className="text-sm text-muted">{o.employer_name} · {WORK_MODES[o.work_mode]} · {JOB_TYPES[o.job_type]}{o.state ? ` · ${o.state}` : ''}{pay ? ` · ${pay}` : ''}</p>
                          </div>
                          <Badge tone={o.interest === 'confirmed' ? 'teal' : o.interest === 'declined' ? 'neutral' : 'blue'}>{o.stage === 'placed' ? 'Placed' : INTEREST[o.interest]}</Badge>
                        </div>
                        {o.description && <p className="mt-3 line-clamp-4 whitespace-pre-line text-sm leading-relaxed">{o.description}</p>}
                        <div className="mt-4">
                          {o.interest === 'pending' && o.invited_by_employer && (
                            <p className="mb-3 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet">{o.employer_name} found your Passport and invited you. Saying yes shares your Passport, email and phone number with them.</p>
                          )}
                          {o.interest === 'pending' ? <InterestButtons id={o.id} role={o.role_title} />
                            : o.interest === 'confirmed' ? (
                              <p className="text-sm text-muted">
                                {Number(o.employer_views) > 0
                                  ? <>The employer has opened your Passport <b className="text-ink">{o.employer_views} {Number(o.employer_views) === 1 ? 'time' : 'times'}</b>, last on {formatDate(o.last_viewed_at!, true)}.</>
                                  : 'You said yes. The talent team will share your Passport with the employer and let you know about next steps.'}
                              </p>
                            ) : <p className="text-sm text-muted">You declined this opportunity. The employer never saw your Passport.</p>}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">Your learning</h2>
                <EvidenceLabel kind="platform" />
              </div>
              {data.learning.length === 0 ? (
                <Card className="p-5 text-sm text-muted">Programmes and certificates from Talentral hubs appear here automatically.</Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.learning.map((l) => {
                    const [label, tone] = STATUS[l.enrolment_status] ?? ['', 'neutral'];
                    const cert = l.certificate_serial && !l.certificate_revoked;
                    return (
                      <Card key={`${l.hub_slug}-${l.cohort_name}-${l.programme_title}`} className="flex flex-col p-5">
                        <div className="flex items-start justify-between gap-2"><p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{l.hub_name}</p><Badge tone={tone}>{label}</Badge></div>
                        <p className="mt-1.5 font-semibold leading-snug">{l.programme_title}</p>
                        <p className="text-sm text-muted">{l.cohort_name}{l.track ? ` · ${l.track}` : ''}</p>
                        {cert && (
                          <div className="mt-auto pt-4">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                              {l.attendance !== null && <span><b>{Number(l.attendance)}%</b> <span className="text-muted">attendance</span></span>}
                              {l.score !== null && <span><b>{Number(l.score)}%</b> <span className="text-muted">score</span></span>}
                            </div>
                            <Link href={`/verify/${l.certificate_serial}`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-blue hover:underline">🎓 View certificate {l.certificate_serial}</Link>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>

            {data.evidence.length > 0 && (
              <section>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 className="text-lg font-semibold">Skills shown in graded work</h2>
                  <EvidenceLabel kind="platform" />
                </div>
                <Card className="p-5">
                  <p className="text-sm text-muted">You reached the pass mark on work that shows these skills. Employers see them as evidence, not just claims.</p>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {bestEvidence(data.evidence).map((e) => (
                      <li key={e.skill} className="flex items-start gap-3 rounded-xl border border-blue/15 bg-blue-50/60 p-3">
                        <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-blue text-xs font-bold text-white">✓</span>
                        <span className="min-w-0 text-sm"><b className="block text-ink">{e.skill}</b><span className="text-muted">{e.assessment} · {Number(e.percent)}%</span></span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            )}

            <Card className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Your profile</h2>
              <p className="mb-5 mt-1 text-sm text-muted">This is what talent officers and, with your permission, employers see. Never include your NIN, date of birth or home address.</p>
              <PassportForm p={p} suggestions={data.suggestions} />
            </Card>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            <Card className="p-5">
              <h2 className="text-lg font-semibold">Privacy and consent</h2>
              <p className="mt-1 text-sm text-muted">Your Passport is yours. Nothing is shared without these switches, and you can change them at any time.</p>
              <div className="mt-4 divide-y divide-line">
                <ConsentSwitch kind="discoverable" on={p.discoverable} since={p.discoverable_at ? formatDate(p.discoverable_at) : null} blocked={gaps.length ? 'Complete the checklist to turn this on.' : undefined} />
                <ConsentSwitch kind="employer_search" on={p.employer_search} since={p.employer_search_at ? formatDate(p.employer_search_at) : null} blocked={gaps.length ? 'Complete the checklist to turn this on.' : undefined} />
                <ConsentSwitch kind="employer_sharing" on={p.employer_sharing} since={p.employer_sharing_at ? formatDate(p.employer_sharing_at) : null} />
                <ConsentSwitch kind="research" on={p.research} since={p.research_at ? formatDate(p.research_at) : null} />
              </div>
              {data.consents.length > 0 && (
                <details className="mt-4 rounded-xl bg-canvas px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-semibold text-muted">Consent history</summary>
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    {data.consents.map((c, i) => <li key={i}>{formatDate(c.at, true)}: {c.granted ? 'turned on' : 'turned off'} {c.kind === 'discoverable' ? 'visibility to talent officers' : c.kind === 'employer_sharing' ? 'sharing with employers' : c.kind === 'employer_search' ? 'search by verified employers' : 'research'}</li>)}
                  </ul>
                </details>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-lg font-semibold">How readiness works</h2>
              <p className="mt-1 text-sm text-muted">A status, never a hidden score. The same rules apply to everyone.</p>
              <ol className="mt-4 space-y-3">
                {(Object.keys(READINESS) as Readiness[]).map((k) => (
                  <li key={k} className={cx('rounded-xl border p-3 text-sm', k === data.readiness ? 'border-violet/30 bg-violet-50/60' : 'border-transparent')}>
                    <div className="flex items-center justify-between gap-2"><ReadinessBadge level={k} />{k === data.readiness && <span className="text-xs font-bold text-violet">You are here</span>}</div>
                    <p className="mt-1.5 text-muted">{READINESS_RULES[k]}</p>
                  </li>
                ))}
              </ol>
            </Card>
          </aside>
        </div>
    </LearnerShell>
  );
}
