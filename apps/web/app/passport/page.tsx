import Link from 'next/link';
import { Suspense } from 'react';
import { withUser } from '@talentral/db';
import {
  INTEREST, INTEREST_HA, JOB_TYPES, JOB_TYPES_HA, READINESS, READINESS_RULES, READINESS_RULES_HA, WORK_MODES, WORK_MODES_HA,
  label, passportGaps, payRange, type Interest, type Readiness,
} from '@talentral/domain';
import { EvidenceLabel, ReadinessBadge, bestEvidence } from '@/components/talent-card';
import { LearnerShell } from '@/components/learner-shell';
import { Badge, Card, LinkButton, cx } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { translator } from '@/lib/i18n';
import { EMPTY_PASSPORT, loadPassport, passportCompleteness } from '@/lib/passport-data';
import { ProgressRing } from '@/components/learner-hero';
import { PassportPhoto } from './photo';
import { ConsentSwitch, InterestButtons } from './controls';
import { Portfolio, type GradedWork } from './portfolio';
import { PassportForm } from './passport-form';
import { Award, Download } from 'lucide-react';

export const metadata = { title: 'Your Passport' };

type Opportunity = { id: string; role_title: string; employer_name: string; description: string | null; work_mode: keyof typeof WORK_MODES;
  job_type: keyof typeof JOB_TYPES; state: string | null; pay_min: number | null; pay_max: number | null; interest: Interest;
  stage: string; created_at: Date; employer_views: string; last_viewed_at: Date | null; invited_by_employer: boolean; source: 'officer' | 'employer' | 'applied' };

const STATUS: Record<string, [string, string, 'teal' | 'blue' | 'neutral']> = {
  active: ['In training', 'Ana horo', 'blue'], completed: ['Completed', 'An kammala', 'teal'], dropped: ['Withdrawn', 'An janye', 'neutral'],
};

const CONSENT_NAMES: Record<string, [string, string]> = {
  discoverable: ['visibility to talent officers', 'ganuwa ga jami’an Talentral'],
  employer_sharing: ['sharing with employers', 'rabawa da masu ɗaukar aiki'],
  employer_search: ['search by verified employers', 'binciken masu ɗaukar aiki da aka tabbatar'],
  research: ['research', 'bincike'],
};

// The interactive sections sit in their own Suspense boundaries so React hydrates them as separate,
// shorter tasks; on a slow phone the page responds sooner (see scripts/perf-check.mjs).
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
    const graded = await tx<GradedWork[]>`select submission_id, lesson_title, course_title, hub_name, score from app.my_graded_work()`;
    return { ...loaded, opportunities, consents, suggestions, graded };
  });
  const lang = user.language;
  const t = translator(lang);
  const p = data.passport ?? { ...EMPTY_PASSPORT, user_id: user.id };
  const gaps = passportGaps(p, lang);
  const first = (user.full_name ?? '').split(' ')[0];
  const complete = passportCompleteness(p, data.portfolio.length);
  const blocked = gaps.length ? t('Complete the checklist to turn this on.', 'Kammala jerin abubuwan kafin ka kunna wannan.') : undefined;

  return (
    <LearnerShell user={user} language={lang} active="passport">
        {/* Header */}
        <section className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 items-start gap-4 sm:items-center sm:gap-5">
            <PassportPhoto src={p.photo_path ? `/media/passport/${user.id}?v=${encodeURIComponent(p.photo_path.slice(-12))}` : null} initial={(user.full_name ?? user.email)[0]!.toUpperCase()} lang={lang} />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-muted">{t('Talentral Passport', 'Fasfon Talentral')}</p>
              <h1 className="mt-1 text-3xl font-semibold leading-tight">{user.full_name ?? t('Your Passport', 'Fasfonka')}</h1>
              <p className="mt-1 text-[15px] text-muted">{p.headline ?? t('Add a headline so people know the work you do.', 'Rubuta taken aikinka domin mutane su san aikin da kake yi.')}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ReadinessBadge level={data.readiness} lang={lang} />
                {p.discoverable ? <Badge tone="teal">{t('Visible to talent officers', 'Jami’an Talentral na gani')}</Badge> : <Badge tone="neutral">{t('Private', 'Sirri')}</Badge>}
                {p.state && <span className="text-sm text-muted">{p.state}</span>}
              </div>
            </div>
            </div>
            <LinkButton variant="secondary" href="/passport/preview">{t('See what employers see', 'Duba abin da masu ɗaukar aiki ke gani')}</LinkButton>
          </div>
        </section>

        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-6">
            {complete.pct < 100 && (
              <Card className="p-5 sm:p-6">
                <div className="flex items-center gap-5">
                  <ProgressRing pct={complete.pct} size={76} stroke={7} label={t(`Passport ${complete.pct}% complete`, `Fasfo ya kammala ${complete.pct}%`)} />
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">{first ? t(`${first}, finish your Passport to be found`, `${first}, kammala Fasfonka domin a same ka`) : t('Finish your Passport to be found', 'Kammala Fasfonka domin a same ka')}</h2>
                    <p className="mt-0.5 text-sm text-muted">{t(`${complete.done} of ${complete.items.length} done. Complete Passports are the ones talent officers put forward first.`, `${complete.done} cikin ${complete.items.length} an gama. Fasfo da aka kammala ne jami’ai ke fara gabatarwa.`)}</p>
                  </div>
                </div>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {complete.items.map((i) => (
                    <li key={i.key} className={cx('flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm', i.done ? 'border-transparent bg-canvas/70 text-muted' : 'border-line bg-white font-medium')}>
                      <span aria-hidden className={cx('grid size-5 shrink-0 place-items-center rounded-full border text-[11px]', i.done ? 'border-teal-700 bg-teal-700 text-white' : 'border-line-strong text-transparent')}>✓</span>
                      <span className={i.done ? 'line-through decoration-mist' : ''}>{t(i.en, i.ha)}</span><span className="sr-only">{i.done ? t(' (done)', ' (an gama)') : t(' (to do)', ' (ba a gama ba)')}</span>
                    </li>
                  ))}
                </ul>
                {gaps.length > 0 && <p className="mt-3 text-xs text-muted">{t('To be visible to talent officers you need: ', 'Domin jami’ai su gan ka kana buƙatar: ')}{gaps.join('; ')}.</p>}
              </Card>
            )}

            {data.opportunities.some((o) => o.source !== 'applied') && (
              <section>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold">{t('Opportunities', 'Damarmaki')}</h2>
                  <Link href="/jobs/applications" className="text-sm font-semibold text-blue hover:underline">{t('Track all my applications →', 'Duba duk neman aikina →')}</Link>
                </div>
                <div className="space-y-3">
                  {data.opportunities.filter((o) => o.source !== 'applied').map((o) => {
                    const pay = payRange(o.pay_min, o.pay_max);
                    const views = Number(o.employer_views);
                    return (
                      <Card key={o.id} className={cx('p-5', o.interest === 'pending' && 'border-blue/40 ring-4 ring-blue/5')}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-display text-lg font-semibold">{o.role_title}</p>
                            <p className="text-sm text-muted">{o.employer_name} · {label(WORK_MODES, WORK_MODES_HA, o.work_mode, lang)} · {label(JOB_TYPES, JOB_TYPES_HA, o.job_type, lang)}{o.state ? ` · ${o.state}` : ''}{pay ? ` · ${pay}` : ''}</p>
                          </div>
                          <Badge tone={o.interest === 'confirmed' ? 'teal' : o.interest === 'declined' ? 'neutral' : 'blue'}>{o.stage === 'placed' ? t('Placed', 'An ɗauka') : label(INTEREST, INTEREST_HA, o.interest, lang)}</Badge>
                        </div>
                        {o.description && <p className="mt-3 line-clamp-4 whitespace-pre-line text-sm leading-relaxed">{o.description}</p>}
                        <div className="mt-4">
                          {o.interest === 'pending' && o.invited_by_employer && (
                            <p className="mb-3 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet">
                              {t(`${o.employer_name} found your Passport and invited you. Saying yes shares your Passport, email and phone number with them.`,
                                `${o.employer_name} sun ga Fasfonka kuma sun gayyace ka. Idan ka amince, za a raba Fasfonka, imel da lambar wayarka da su.`)}
                            </p>
                          )}
                          {o.interest === 'pending' ? <InterestButtons id={o.id} role={o.role_title} lang={lang} />
                            : o.interest === 'confirmed' ? (
                              <p className="text-sm text-muted">
                                {views > 0
                                  ? lang === 'ha'
                                    ? <>Mai ɗaukar aikin ya buɗe Fasfonka <b className="text-ink">sau {views}</b>, na ƙarshe a {formatDate(o.last_viewed_at!, true)}.</>
                                    : <>The employer has opened your Passport <b className="text-ink">{views} {views === 1 ? 'time' : 'times'}</b>, last on {formatDate(o.last_viewed_at!, true)}.</>
                                  : t('You said yes. The talent team will share your Passport with the employer and let you know about next steps.',
                                    'Ka amince. Jami’an Talentral za su raba Fasfonka da mai ɗaukar aikin kuma su sanar da kai matakai na gaba.')}
                              </p>
                            ) : <p className="text-sm text-muted">{t('You declined this opportunity. The employer never saw your Passport.', 'Ka ƙi wannan damar. Mai ɗaukar aikin bai ga Fasfonka ba.')}</p>}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">{t('Your learning', 'Karatunka')}</h2>
                <EvidenceLabel kind="platform" lang={lang} />
              </div>
              {data.learning.length === 0 ? (
                <Card className="p-5 text-sm text-muted">{t('Programmes and certificates from Talentral hubs appear here automatically.', 'Shirye-shirye da takardun shaida daga cibiyoyin Talentral za su bayyana a nan kai tsaye.')}</Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.learning.map((l) => {
                    const [en, ha, tone] = STATUS[l.enrolment_status] ?? ['', '', 'neutral'];
                    const cert = l.certificate_serial && !l.certificate_revoked;
                    return (
                      <Card key={`${l.hub_slug}-${l.cohort_name}-${l.programme_title}`} className="flex flex-col p-5">
                        <div className="flex items-start justify-between gap-2"><p className="text-[13px] font-medium text-muted">{l.hub_name}</p><Badge tone={tone}>{t(en, ha)}</Badge></div>
                        <p className="mt-1.5 font-semibold leading-snug">{l.programme_title}</p>
                        <p className="text-sm text-muted">{l.cohort_name}{l.track ? ` · ${l.track}` : ''}</p>
                        {cert && (
                          <div className="mt-auto pt-4">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                              {l.attendance !== null && <span><b>{Number(l.attendance)}%</b> <span className="text-muted">{t('attendance', 'halarta')}</span></span>}
                              {l.score !== null && <span><b>{Number(l.score)}%</b> <span className="text-muted">{t('score', 'maki')}</span></span>}
                            </div>
                            <Link href={`/verify/${l.certificate_serial}`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-blue hover:underline"><Award className="size-4" aria-hidden />{t('View certificate', 'Duba takardar shaida')} {l.certificate_serial}</Link>
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
                  <h2 className="text-lg font-semibold">{t('Skills shown in graded work', 'Ƙwarewar da ka nuna a ayyukan da aka duba')}</h2>
                  <EvidenceLabel kind="platform" lang={lang} />
                </div>
                <Card className="p-5">
                  <p className="text-sm text-muted">{t('You reached the pass mark on work that shows these skills. Employers see them as evidence, not just claims.',
                    'Ka kai makin wucewa a ayyukan da ke nuna waɗannan ƙwarewa. Masu ɗaukar aiki suna ganinsu a matsayin shaida, ba magana kawai ba.')}</p>
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
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{t('Portfolio', 'Tarin ayyuka')}</h2>
                <span className="text-xs text-muted">{t(`${data.portfolio.length} of 12`, `${data.portfolio.length} cikin 12`)}</span>
              </div>
              <p className="mb-4 mt-1 text-sm text-muted">{t('Projects that show what you can do. Link graded work from Talentral to make an item platform-evidenced; a talent officer can also check it and mark it verified.',
                'Ayyukan da ke nuna abin da za ka iya yi. Haɗa aikin da aka duba a Talentral domin ya zama shaidar Talentral.')}</p>
              <Suspense><Portfolio items={data.portfolio} graded={data.graded} lang={lang} /></Suspense>
            </Card>

            <Card className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold">{t('Your profile', 'Bayananka')}</h2>
              <p className="mb-5 mt-1 text-sm text-muted">{t('This is what talent officers and, with your permission, employers see. Never include your NIN, date of birth or home address.',
                'Wannan shi ne abin da jami’an Talentral, da kuma masu ɗaukar aiki idan ka yarda, ke gani. Kada ka taɓa saka lambar NIN, ranar haihuwa ko adireshin gidanka.')}</p>
              <Suspense><PassportForm p={p} suggestions={data.suggestions} lang={lang} /></Suspense>
            </Card>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            <Card className="p-5">
              <h2 className="text-lg font-semibold">{t('Privacy and consent', 'Sirri da amincewa')}</h2>
              <p className="mt-1 text-sm text-muted">{t('Your Passport is yours. Nothing is shared without these switches, and you can change them at any time.',
                'Fasfonka naka ne. Ba a raba komai ba tare da waɗannan maɓallan ba, kuma za ka iya canza su a kowane lokaci.')}</p>
              <Suspense><div className="mt-4 divide-y divide-line">
                <ConsentSwitch lang={lang} kind="discoverable" on={p.discoverable} since={p.discoverable_at ? formatDate(p.discoverable_at) : null} blocked={blocked} />
                <ConsentSwitch lang={lang} kind="employer_search" on={p.employer_search} since={p.employer_search_at ? formatDate(p.employer_search_at) : null} blocked={blocked} />
                <ConsentSwitch lang={lang} kind="employer_sharing" on={p.employer_sharing} since={p.employer_sharing_at ? formatDate(p.employer_sharing_at) : null} />
                <ConsentSwitch lang={lang} kind="research" on={p.research} since={p.research_at ? formatDate(p.research_at) : null} />
              </div></Suspense>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
                <a href="/account/export" download className="text-blue hover:underline"><Download className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />{t('Download my data', 'Sauke bayanaina')}</a>
                <a href="/account/security" className="text-blue hover:underline">{t('Account security', 'Tsaron asusu')}</a>
              </div>
              {data.consents.length > 0 && (
                <details className="mt-4 rounded-xl bg-canvas px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-semibold text-muted">{t('Consent history', 'Tarihin amincewa')}</summary>
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    {data.consents.map((c, i) => {
                      const [en, ha] = CONSENT_NAMES[c.kind] ?? [c.kind, c.kind];
                      return <li key={i}>{formatDate(c.at, true)}: {c.granted ? t('turned on', 'an kunna') : t('turned off', 'an kashe')} {t(en, ha)}</li>;
                    })}
                  </ul>
                </details>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-lg font-semibold">{t('How readiness works', 'Yadda ake auna shiri')}</h2>
              <p className="mt-1 text-sm text-muted">{t('A status, never a hidden score. The same rules apply to everyone.', 'Matsayi ne, ba maki na ɓoye ba. Dokoki ɗaya ne ga kowa.')}</p>
              <ol className="mt-4 space-y-3">
                {(Object.keys(READINESS) as Readiness[]).map((k) => (
                  <li key={k} className={cx('rounded-xl border p-3 text-sm', k === data.readiness ? 'border-violet/30 bg-violet-50/60' : 'border-transparent')}>
                    <div className="flex items-center justify-between gap-2"><ReadinessBadge level={k} lang={lang} />{k === data.readiness && <span className="text-xs font-bold text-violet">{t('You are here', 'Kana nan')}</span>}</div>
                    <p className="mt-1.5 text-muted">{label(READINESS_RULES, READINESS_RULES_HA, k, lang)}</p>
                  </li>
                ))}
              </ol>
            </Card>
          </aside>
        </div>
    </LearnerShell>
  );
}
