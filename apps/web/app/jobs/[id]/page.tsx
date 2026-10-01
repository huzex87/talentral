import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { JOB_TYPES, JOB_TYPES_HA, WORK_MODES, WORK_MODES_HA, closingLabel, label, matchSummary, payRange, skillStatus, watToday } from '@talentral/domain';
import { SkillChip, SkillLegend } from '@/components/skill-status';
import { Badge, Card, LinkButton } from '@/components/ui';
import { currentUser } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { visitorLanguage } from '@/lib/i18n';
import { boardJobs, mySkillSources } from '@/lib/jobs-data';
import { JobsFrame } from '../frame';

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const user = await currentUser();
  return withUser(user?.id ?? null, async (tx) => {
    const job = (await boardJobs(tx)).find((j) => j.id === id);
    if (!job) return null;
    if (!user) return { user, job, sources: null, learner: false };
    const [l] = await tx<{ learner: boolean }[]>`select exists (select 1 from app.learner_courses()) or exists (select 1 from public.passports where user_id = ${user.id}) as learner`;
    return { user, job, sources: l?.learner ? await mySkillSources(tx, user.id) : null, learner: Boolean(l?.learner) };
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

  return (
    <JobsFrame user={user} learner={data.learner} lang={lang}>
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
          <Card className="p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">{t('How to be considered', 'Yadda za a yi la’akari da kai')}</h2>
            {!user ? (
              <><p className="mt-2 text-sm">{t('Employers find people through their Talentral Passport: verified skills and graded work, not just a CV.', 'Masu ɗaukar aiki suna samun mutane ta Fasfon Talentral.')}</p>
                <LinkButton href="/sign-in" className="mt-3 w-full">{t('Sign in', 'Shiga')}</LinkButton></>
            ) : sources?.employerSearch ? (
              <p className="mt-2 text-sm">{t('Your Passport is open to verified employers, so this employer can find you and invite you. Keep your portfolio and availability up to date.', 'Fasfonka a buɗe yake ga masu ɗaukar aiki, don haka za su iya samunka.')}</p>
            ) : (
              <><p className="mt-2 text-sm">{t('Employers find and invite people whose Passports are open to verified employers. Yours is not open yet.', 'Masu ɗaukar aiki suna gayyatar mutanen da Fasfonsu ke buɗe. Naka bai buɗe ba tukuna.')}</p>
                <LinkButton href="/passport" className="mt-3 w-full">{sources?.passport ? t('Open my Passport to employers', 'Buɗe Fasfona') : t('Create my Passport', 'Ƙirƙiri Fasfona')}</LinkButton></>
            )}
          </Card>
        </aside>
      </div>
    </JobsFrame>
  );
}
