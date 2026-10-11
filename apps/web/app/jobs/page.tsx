import { BriefcaseBusiness } from 'lucide-react';
import Link from 'next/link';
import { withUser } from '@talentral/db';
import {
  JOB_TYPES, JOB_TYPES_HA, NIGERIAN_STATES, WORK_MODES, WORK_MODES_HA, closingLabel, label, matchSummary, payRange, skillStatus, watToday,
} from '@talentral/domain';
import { SkillChip, SkillLegend } from '@/components/skill-status';
import { Badge, Card, EmptyState, Input, Select, cx } from '@/components/ui';
import { FilterBar } from '@/components/filter-bar';
import { currentUser } from '@/lib/auth';
import { visitorLanguage } from '@/lib/i18n';
import { boardJobs, liveApplications, myApplications, mySkillSources } from '@/lib/jobs-data';
import { JobsFrame, JobsTabs } from './frame';

export const metadata = { title: 'Jobs', description: 'Jobs from employers verified by Talentral, with pay shown. See which of the skills you have proven.' };

type Search = { q?: string; mode?: string; type?: string; state?: string; sort?: string };

export default async function Jobs({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const user = await currentUser();
  const data = await withUser(user?.id ?? null, async (tx) => {
    const jobs = await boardJobs(tx);
    if (!user) return { jobs, sources: null, learner: false, applications: [] };
    const [l] = await tx<{ learner: boolean }[]>`select exists (select 1 from app.learner_courses()) or exists (select 1 from public.passports where user_id = ${user.id}) as learner`;
    return { jobs, sources: l?.learner ? await mySkillSources(tx, user.id) : null, learner: Boolean(l?.learner), applications: l?.learner ? await myApplications(tx) : [] };
  });
  const lang = user?.language ?? (await visitorLanguage());
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const today = watToday(new Date());
  const q = (sp.q ?? '').trim().toLowerCase();

  const rows = data.jobs
    .filter((j) => (!sp.mode || j.work_mode === sp.mode) && (!sp.type || j.job_type === sp.type) && (!sp.state || j.state === sp.state || (sp.state && j.work_mode === 'remote'))
      && (!q || [j.title, j.employer_name, j.description ?? '', ...j.skills].join(' ').toLowerCase().includes(q)))
    .map((j) => {
      const statuses = data.sources ? skillStatus(j.skills, data.sources) : null;
      return { j, statuses, summary: statuses ? matchSummary(statuses) : null };
    });
  if (sp.sort !== 'newest' && data.sources) rows.sort((a, b) => (b.summary!.proven * 2 + b.summary!.have) / Math.max(b.summary!.total, 1) - (a.summary!.proven * 2 + a.summary!.have) / Math.max(a.summary!.total, 1));
  const filtered = Boolean(q || sp.mode || sp.type || sp.state);
  const applied = new Map(data.applications.filter((a) => a.interest === 'confirmed' && !a.withdrawn_at).map((a) => [a.role_id, a]));

  return (
    <JobsFrame user={user} learner={data.learner} lang={lang}>
      {data.learner && <JobsTabs active="find" applications={liveApplications(data.applications)} lang={lang} />}
      <section className="glow-teal relative mb-4 overflow-hidden rounded-[var(--radius-card)] border border-line p-5 shadow-[var(--shadow-card)] sm:mb-6 sm:p-8">
        {/* Jobs wear teal, the logo's colour for work and verified results. */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal to-blue" aria-hidden />
        <div className="relative">
          <p className="text-[13px] font-semibold text-teal-700">{t('Talentral jobs', 'Ayyukan Talentral')}</p>
          <h1 className="mt-1 text-[26px] font-semibold leading-tight sm:text-3xl">{t('Jobs from verified employers', 'Ayyuka daga masu ɗaukar aiki da aka tabbatar')}</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted sm:text-[15px]">{data.sources
            ? t('Every job shows the skills it needs and which of them you have proven. Proven skills come from your graded work on Talentral.', 'Kowane aiki yana nuna ƙwarewar da yake buƙata da waɗanda ka tabbatar. Ƙwarewar da aka tabbatar tana fitowa daga ayyukanka da aka duba a Talentral.')
            : t('Every employer here is checked by the Talentral talent team, and every job shows its pay.', 'Jami’an Talentral sun duba kowane mai ɗaukar aiki a nan, kuma kowane aiki yana nuna albashinsa.')}</p>
          {!user && <p className="mt-3 text-sm"><Link href="/sign-in" className="font-semibold text-blue underline underline-offset-2">{t('Sign in', 'Shiga')}</Link> {t('to see how your proven skills match each job.', 'domin ganin yadda ƙwarewarka ta dace da kowane aiki.')}</p>}
        </div>
      </section>

      {/* On phones the search stays under the app bar while the list scrolls. It sits above the bars
          (z-40) so its filter sheet opens over the tab bar. */}
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-40 -mx-4 mb-3 border-b border-transparent bg-canvas px-4 py-2 sm:static sm:z-auto sm:mx-0 sm:mb-4 sm:bg-transparent sm:p-0">
      <FilterBar ariaLabel={t('Filter jobs', 'Tace ayyuka')} applyLabel={t('Search', 'Nema')} label={t('Filters', 'Tacewa')}
        active={[sp.mode, sp.type, sp.state].filter(Boolean).length}
        lead={<Input type="search" name="q" defaultValue={sp.q ?? ''} placeholder={t('Search jobs or skills', 'Nemi ayyuka ko ƙwarewa')} aria-label={t('Search', 'Nema')} />}>
        <Select name="mode" defaultValue={sp.mode ?? ''} aria-label={t('Work mode', 'Yanayin aiki')} className="md:w-44"><option value="">{t('Any work mode', 'Kowane yanayi')}</option>{Object.keys(WORK_MODES).map((k) => <option key={k} value={k}>{label(WORK_MODES, WORK_MODES_HA, k as keyof typeof WORK_MODES, lang)}</option>)}</Select>
        <Select name="type" defaultValue={sp.type ?? ''} aria-label={t('Job type', 'Irin aiki')} className="md:w-40"><option value="">{t('Any type', 'Kowane iri')}</option>{Object.keys(JOB_TYPES).map((k) => <option key={k} value={k}>{label(JOB_TYPES, JOB_TYPES_HA, k as keyof typeof JOB_TYPES, lang)}</option>)}</Select>
        <Select name="state" defaultValue={sp.state ?? ''} aria-label={t('State', 'Jiha')} className="md:w-40"><option value="">{t('Anywhere', 'Ko’ina')}</option>{NIGERIAN_STATES.map((s) => <option key={s}>{s}</option>)}</Select>
      </FilterBar>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted" role="status">{rows.length} {rows.length === 1 ? t('job', 'aiki') : t('jobs', 'ayyuka')}{filtered && <> · <Link href="/jobs" className="font-semibold text-blue hover:underline">{t('Clear filters', 'Share tacewa')}</Link></>}</p>
        {data.sources && <SkillLegend lang={lang} />}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={BriefcaseBusiness} title={filtered ? t('No jobs match these filters', 'Babu aikin da ya dace da wannan tacewa') : t('No open jobs right now', 'Babu aiki a buɗe yanzu')}>
          {filtered ? t('Try a wider search.', 'Gwada bincike mai faɗi.') : t('New jobs from verified employers appear here. Keep building your Passport meanwhile.', 'Sababbin ayyuka za su bayyana a nan. Ci gaba da gina Fasfonka.')}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" aria-label={t('Jobs', 'Ayyuka')}>
          {rows.map(({ j, statuses, summary }) => {
            const pay = payRange(j.pay_min, j.pay_max);
            const closing = closingLabel(j.closes_on, today);
            return (
              <li key={j.id}>
                <Link href={`/jobs/${j.id}`} className="block h-full rounded-[var(--radius-card)]">
                  <Card className="tap flex h-full flex-col p-5 hover:border-blue/40 hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-display text-lg font-semibold leading-snug">{j.title}</h2>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-muted">{j.employer_name} <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700"><span aria-hidden>✓</span>{t('Verified employer', 'Mai ɗaukar aiki da aka tabbatar')}</span></p>
                      </div>
                      {applied.has(j.id) ? <Badge tone="teal">{t('Applied', 'Ka nema')}</Badge>
                        : closing && <Badge tone={closing.startsWith('Closes in') || closing === 'Closes today' || closing === 'Closes tomorrow' ? 'amber' : 'neutral'}>{closing}</Badge>}
                    </div>
                    <p className="mt-2 text-sm text-muted">{label(WORK_MODES, WORK_MODES_HA, j.work_mode, lang)} · {label(JOB_TYPES, JOB_TYPES_HA, j.job_type, lang)}{j.state ? ` · ${j.state}` : ''}</p>
                    {pay && <p className="mt-1 text-sm font-semibold">{pay}</p>}
                    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={t('Skills needed', 'Ƙwarewar da ake buƙata')}>
                      {(statuses ?? j.skills.map((s) => ({ skill: s, status: null }))).map((s) => (
                        <li key={s.skill}>{s.status ? <SkillChip skill={s.skill} status={s.status} lang={lang} /> : <span className="inline-flex rounded-full border border-line px-2.5 py-1 text-xs font-semibold">{s.skill}</span>}</li>
                      ))}
                    </ul>
                    {summary && (
                      <p className={cx('mt-auto pt-3 text-sm font-semibold', summary.proven ? 'text-blue' : 'text-muted')}>
                        {t(`You have ${summary.have} of ${summary.total} skills${summary.proven ? `, ${summary.proven} proven` : ''}`, `Kana da ${summary.have} cikin ${summary.total}${summary.proven ? `, ${summary.proven} an tabbatar` : ''}`)}
                      </p>
                    )}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </JobsFrame>
  );
}
