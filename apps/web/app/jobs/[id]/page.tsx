import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { JOB_TYPES, JOB_TYPES_HA, WORK_MODES, WORK_MODES_HA, applicationProgress, closingLabel, label, matchSummary, matchTalent, payRange, skillStatus, watToday } from '@talentral/domain';
import { SkillChip, SkillLegend } from '@/components/skill-status';
import { Badge, Card, LinkButton } from '@/components/ui';
import { currentUser } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { visitorLanguage } from '@/lib/i18n';
import { boardJobs, liveApplications, myApplications, mySkillSources } from '@/lib/jobs-data';
import { myTalent } from '@/lib/talent-data';
import { ApplyForm, WithdrawButton } from '../apply';
import { JobsFrame, JobsTabs } from '../frame';

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const user = await currentUser();
  return withUser(user?.id ?? null, async (tx) => {
    const job = (await boardJobs(tx)).find((j) => j.id === id);
    if (!job) return null;
    if (!user) return { user, job, sources: null, learner: false, me: null, applications: [], sharing: false };
    const [l] = await tx<{ learner: boolean }[]>`select exists (select 1 from app.learner_courses()) or exists (select 1 from public.passports where user_id = ${user.id}) as learner`;
    if (!l?.learner) return { user, job, sources: null, learner: false, me: null, applications: [], sharing: false };
    const [p] = await tx<{ employer_sharing: boolean }[]>`select employer_sharing from public.passports where user_id = ${user.id}`;
    return { user, job, sources: await mySkillSources(tx, user.id), learner: true, me: await myTalent(tx, user.id), applications: await myApplications(tx), sharing: Boolean(p?.employer_sharing) };
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const data = await load((await params).id);
  return data ? { title: `${data.job.title} at ${data.job.employer_name}`, description: `${data.job.title}: ${payRange(data.job.pay_min, data.job.pay_max) ?? ''} Verified by Talentral.` } : { title: 'Job not found' };
}

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const data = await load((await params).id);
  if (!data) notFound();
  const { user, job: j, sources } = data;
  const lang = user?.language ?? (await visitorLanguage());
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const pay = payRange(j.pay_min, j.pay_max);
  const closing = closingLabel(j.closes_on, watToday(new Date()));
  const statuses = sources ? skillStatus(j.skills, sources) : null;
  const summary = statuses ? matchSummary(statuses) : null;
  const missing = statuses?.filter((s) => s.status === 'missing').map((s) => s.skill) ?? [];
  const claimed = statuses?.filter((s) => s.status === 'self').map((s) => s.skill) ?? [];
  const match = data.me ? matchTalent({ skills: j.skills, work_mode: j.work_mode, state: j.state }, data.me) : null;
  const mine = data.applications.find((a) => a.role_id === j.id) ?? null;
  const progress = mine ? applicationProgress(mine) : null;
  const canApply = !mine || progress?.state === 'withdrawn' || progress?.state === 'said_no';

  return (
    <JobsFrame user={user} learner={data.learner} lang={lang}>
      {data.learner && <JobsTabs active="find" applications={liveApplications(data.applications)} lang={lang} />}
      <Link href="/jobs" className="text-sm font-semibold text-violet hover:underline">← {t('All jobs', 'Duk ayyuka')}</Link>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <article className="min-w-0 space-y-6">
          <Card className="p-6 sm:p-8">
            <p className="text-sm font-semibold text-muted">{j.employer_name}</p>
            <h1 className="mt-1 text-3xl font-semibold leading-tight">{j.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="blue">{label(WORK_MODES, WORK_MODES_HA, j.work_mode, lang)}</Badge>
              <Badge tone="neutral">{label(JOB_TYPES, JOB_TYPES_HA, j.job_type, lang)}</Badge>
              {j.state && <Badge tone="neutral">{j.state}</Badge>}
              {j.openings > 1 && <Badge tone="neutral">{t(`${j.openings} openings`, `Guraben aiki ${j.openings}`)}</Badge>}
              {closing && <Badge tone="amber">{closing}</Badge>}
            </div>
            {pay && <p className="mt-4 font-display text-2xl font-semibold">{pay}</p>}
            <p className="mt-1 text-xs text-muted">{t('Posted', 'An saka')} {formatDate(j.published_at)}</p>
            {j.description && <div className="mt-6"><h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">{t('About the job', 'Game da aikin')}</h2><p className="mt-2 whitespace-pre-line leading-relaxed">{j.description}</p></div>}
            {j.requirements && <div className="mt-6"><h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">{t('Requirements', 'Abubuwan da ake buƙata')}</h2><p className="mt-2 whitespace-pre-line leading-relaxed">{j.requirements}</p></div>}
          </Card>

          <Card className="p-6 sm:p-8">
            <h2 className="text-lg font-semibold">{statuses ? t('Your skills for this job', 'Ƙwarewarka don wannan aiki') : t('Skills needed', 'Ƙwarewar da ake buƙata')}</h2>
            {summary && <p className="mt-1 text-sm text-muted">{t(`You have ${summary.have} of ${summary.total}, and ${summary.proven} ${summary.proven === 1 ? 'is' : 'are'} proven in graded work or verified.`, `Kana da ${summary.have} cikin ${summary.total}, kuma ${summary.proven} an tabbatar.`)}</p>}
            <ul className="mt-4 flex flex-wrap gap-2" aria-label={t('Skills', 'Ƙwarewa')}>
              {(statuses ?? j.skills.map((s) => ({ skill: s, status: null }))).map((s) => (
                <li key={s.skill}>{s.status ? <SkillChip skill={s.skill} status={s.status} lang={lang} /> : <span className="inline-flex rounded-full border border-line px-2.5 py-1 text-xs font-semibold">{s.skill}</span>}</li>
              ))}
            </ul>
            {statuses && <div className="mt-4"><SkillLegend lang={lang} /></div>}
            {statuses && (claimed.length > 0 || missing.length > 0) && (
              <div className="mt-5 space-y-2 rounded-xl bg-canvas p-4 text-sm">
                <p className="font-semibold">{t('How to strengthen your case', 'Yadda za ka ƙarfafa matsayinka')}</p>
                {claimed.length > 0 && <p>{t(`Show ${claimed.join(', ')} in a project: add it to your portfolio with a link, or link graded work from Talentral so it counts as proven.`, `Nuna ${claimed.join(', ')} a wani aiki: ƙara shi a cikin tarin ayyukanka.`)}</p>}
                {missing.length > 0 && <p>{t(`Ask your hub about learning ${missing.join(', ')}. Graded work on Talentral turns a skill into proof employers trust.`, `Tambayi cibiyarka game da koyon ${missing.join(', ')}.`)}</p>}
              </div>
            )}
          </Card>
        </article>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">{t('The employer', 'Mai ɗaukar aikin')}</h2>
            <p className="mt-2 text-lg font-semibold">{j.employer_name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-teal-700"><span aria-hidden>✓</span>{t('Verified by Talentral', 'Talentral ta tabbatar')}</p>
            <p className="mt-2 text-sm text-muted">{[j.employer_sector, j.employer_state, j.employer_size && `${j.employer_size} ${t('people', 'mutane')}`].filter(Boolean).join(' · ')}</p>
            {j.employer_website && <a href={j.employer_website} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-blue underline underline-offset-2">{j.employer_website.replace(/^https?:\/\//, '')} ↗</a>}
            <p className="mt-3 text-xs text-muted">{t('The talent team checked this organisation before it could post. Employers never charge you a fee to apply or to work. Report anything that seems wrong.', 'Jami’an Talentral sun duba wannan kamfani kafin ya saka aiki. Masu ɗaukar aiki ba sa karɓar kuɗi daga gare ka.')}</p>
          </Card>
          <Card className="p-5" id="apply">
            {!user ? (
              <><h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">{t('How to apply', 'Yadda za ka nema')}</h2>
                <p className="mt-2 text-sm">{t('Apply with your Talentral Passport: verified skills and graded work, not just a CV.', 'Nema da Fasfon Talentral: ƙwarewar da aka tabbatar da ayyukan da aka duba, ba CV kawai ba.')}</p>
                <LinkButton href="/sign-in" className="mt-3 w-full">{t('Sign in to apply', 'Shiga domin nema')}</LinkButton></>
            ) : !data.learner || !sources?.passport ? (
              <><h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">{t('How to apply', 'Yadda za ka nema')}</h2>
                <p className="mt-2 text-sm">{t('Employers see your Talentral Passport when you apply. Create yours first; it takes a few minutes.', 'Masu ɗaukar aiki suna ganin Fasfonka idan ka nema. Ƙirƙiri naka tukuna; ba zai ɗauki lokaci ba.')}</p>
                <LinkButton href="/passport" className="mt-3 w-full">{t('Create my Passport', 'Ƙirƙiri Fasfona')}</LinkButton></>
            ) : mine && !canApply ? (
              <>
                <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">{t('Your application', 'Neman aikinka')}</h2>
                <p className="mt-2"><Badge tone={progress!.tone}>{lang === 'ha' ? progress!.ha : progress!.en}</Badge></p>
                {progress!.state === 'invited' ? (
                  <p className="mt-2 text-sm">{t(`${j.employer_name} invited you to this job. Reply from My applications.`, `${j.employer_name} sun gayyace ka zuwa wannan aikin. Ba da amsa daga Neman aikina.`)}</p>
                ) : (
                  <p className="mt-2 text-sm text-muted">{mine.applied_at ? t(`You applied on ${formatDate(mine.applied_at)}.`, `Ka nema a ranar ${formatDate(mine.applied_at)}.`) : t(`You said yes on ${formatDate(mine.interest_at)}.`, `Ka amince a ranar ${formatDate(mine.interest_at)}.`)}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <LinkButton href="/jobs/applications" variant="secondary" size="sm">{t('My applications', 'Neman aikina')}</LinkButton>
                  {progress!.state === 'active' && <WithdrawButton id={mine.id} role={j.title} lang={lang} />}
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">{t('Apply for this job', 'Nemi wannan aikin')}</h2>
                {mine?.withdrawn_at && (
                  <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-sm text-muted" role="status">
                    {t(`You withdrew on ${formatDate(mine.withdrawn_at)}. The employer no longer sees your application. You can apply again.`, `Ka janye a ranar ${formatDate(mine.withdrawn_at)}. Za ka iya sake nema.`)}
                  </p>
                )}
                {match && (match.reasons.length > 0 || match.concerns.length > 0) && (
                  <div className="mt-3 rounded-xl bg-canvas p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{t('How you match', 'Yadda ka dace')}</p>
                    <ul className="mt-1.5 space-y-1 text-sm" aria-label={t('How you match', 'Yadda ka dace')}>
                      {match.reasons.map((r) => <li key={r} className="flex gap-2"><span aria-hidden className="text-teal-700">✓</span>{r}</li>)}
                      {match.concerns.map((r) => <li key={r} className="flex gap-2 text-muted"><span aria-hidden className="text-amber-800">!</span>{r}</li>)}
                    </ul>
                    <p className="mt-2 text-xs text-muted">{t('The employer sees these reasons with your application. Improve them from your Passport.', 'Mai ɗaukar aikin yana ganin waɗannan dalilai tare da neman ka.')}</p>
                  </div>
                )}
                <ApplyForm jobId={j.id} employer={j.employer_name} sharing={data.sharing} lang={lang} />
              </>
            )}
          </Card>
        </aside>
      </div>
    </JobsFrame>
  );
}
