import { Send } from 'lucide-react';
import Link from 'next/link';
import { withUser } from '@talentral/db';
import {
  APPLICATION_STEPS, JOB_TYPES, JOB_TYPES_HA, SOURCE_LABELS_LEARNER, SOURCE_LABELS_LEARNER_HA, WORK_MODES, WORK_MODES_HA,
  applicationProgress, label, payRange, retentionDueOn, type ApplicationProgress,
} from '@talentral/domain';
import { Badge, Card, EmptyState, LinkButton, PageHeader, cx } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { liveApplications, myApplications, type MyApplication } from '@/lib/jobs-data';
import { InterestButtons } from '../../passport/controls';
import { WithdrawButton } from '../apply';
import { JobsFrame, JobsTabs } from '../frame';

export const metadata = { title: 'My applications' };

type Lang = 'en' | 'ha';

export default async function MyApplications() {
  const user = await requireUser();
  const lang: Lang = user.language;
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const list = await withUser(user.id, (tx) => myApplications(tx));
  const rows = list.map((a) => ({ a, p: applicationProgress(a) }));
  const invites = rows.filter((r) => r.p.state === 'invited');
  const open = rows.filter((r) => r.p.state === 'active' || r.p.state === 'hired');
  const closed = rows.filter((r) => !['invited', 'active', 'hired'].includes(r.p.state));
  const count = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).length;
  const stats = [
    { label: t('In progress', 'Ana ci gaba'), value: count((r) => r.p.state === 'active') },
    { label: t('Interviews', 'Hira'), value: count((r) => r.p.state === 'active' && r.a.stage === 'interviewed') },
    { label: t('Offers', 'Tayi'), value: count((r) => r.p.state === 'active' && r.a.stage === 'offered') },
    { label: t('Hired', 'An ɗauka'), value: count((r) => r.p.state === 'hired') },
  ];

  return (
    <JobsFrame user={user} learner lang={lang}>
      <JobsTabs active="applications" applications={liveApplications(list)} lang={lang} />
      <PageHeader title={t('My applications', 'Neman aikina')}
        description={t('Every job you applied to or were put forward for, and where each one stands. Employers update the stages; you get an email when something changes.',
          'Duk aikin da ka nema ko aka gabatar da kai, da matsayin kowanne. Masu ɗaukar aiki suna sabunta matakai; za ka sami imel idan wani abu ya canza.')}
        actions={<LinkButton href="/jobs" variant="secondary">{t('Find jobs', 'Nemi ayyuka')}</LinkButton>} />

      {rows.length === 0 ? (
        <EmptyState icon={Send} title={t('No applications yet', 'Babu neman aiki tukuna')} action={<LinkButton href="/jobs">{t('Browse jobs', 'Duba ayyuka')}</LinkButton>}>
          {t('Apply to jobs from verified employers with your Passport. Your proven skills go with every application.', 'Nemi ayyuka daga masu ɗaukar aiki da aka tabbatar da Fasfonka.')}
        </EmptyState>
      ) : (
        <div className="space-y-8">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col-reverse justify-end rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]">
                <dt className="mt-0.5 text-[13px] font-medium text-muted">{s.label}</dt>
                <dd className="font-display text-2xl font-semibold tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>

          {invites.length > 0 && (
            <section aria-labelledby="invites">
              <h2 id="invites" className="mb-3 text-lg font-semibold">{t('Waiting for your reply', 'Suna jiran amsarka')}</h2>
              <ul className="space-y-3">
                {invites.map(({ a }) => (
                  <li key={a.id}>
                    <Card className="border-blue/40 p-5 ring-4 ring-blue/5">
                      <JobLine a={a} lang={lang} />
                      <p className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet">
                        {a.source === 'employer'
                          ? t(`${a.employer_name} found your Passport and invited you. Saying yes shares your Passport, email and phone number with them.`, `${a.employer_name} sun ga Fasfonka kuma sun gayyace ka. Idan ka amince, za a raba Fasfonka, imel da lambar wayarka da su.`)
                          : t('The Talentral talent team thinks you fit this job. Saying yes lets them share your Passport with the employer.', 'Jami’an Talentral suna ganin ka dace da wannan aikin. Idan ka amince, za su raba Fasfonka da mai ɗaukar aikin.')}
                      </p>
                      <div className="mt-3"><InterestButtons id={a.id} role={a.role_title} lang={lang} /></div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {open.length > 0 && (
            <section aria-labelledby="open-apps">
              <h2 id="open-apps" className="mb-3 text-lg font-semibold">{t('In progress', 'Ana ci gaba')}</h2>
              <ul className="space-y-3" aria-label={t('Applications in progress', 'Neman aiki da ake ci gaba')}>
                {open.map(({ a, p }) => <li key={a.id}><ApplicationCard a={a} p={p} lang={lang} /></li>)}
              </ul>
            </section>
          )}

          {closed.length > 0 && (
            <section aria-labelledby="closed-apps">
              <h2 id="closed-apps" className="mb-3 text-lg font-semibold">{t('Closed', 'An rufe')}</h2>
              <ul className="space-y-3" aria-label={t('Closed applications', 'Neman aikin da aka rufe')}>
                {closed.map(({ a, p }) => <li key={a.id}><ApplicationCard a={a} p={p} lang={lang} /></li>)}
              </ul>
            </section>
          )}
        </div>
      )}
    </JobsFrame>
  );
}

function JobLine({ a, lang }: { a: MyApplication; lang: Lang }) {
  const pay = payRange(a.pay_min, a.pay_max);
  return (
    <div className="min-w-0">
      {a.on_board ? <Link href={`/jobs/${a.role_id}`} className="font-display text-lg font-semibold hover:text-blue">{a.role_title}</Link>
        : <p className="font-display text-lg font-semibold">{a.role_title}</p>}
      <p className="text-sm text-muted">{a.employer_name} · {label(WORK_MODES, WORK_MODES_HA, a.work_mode, lang)} · {label(JOB_TYPES, JOB_TYPES_HA, a.job_type, lang)}{a.state ? ` · ${a.state}` : ''}{pay ? ` · ${pay}` : ''}</p>
    </div>
  );
}

function ApplicationCard({ a, p, lang }: { a: MyApplication; p: ApplicationProgress; lang: Lang }) {
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const dimmed = !['active', 'hired'].includes(p.state);
  const views = Number(a.employer_views);
  return (
    <Card className={cx('p-5', dimmed && 'bg-canvas/40')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <JobLine a={a} lang={lang} />
        <Badge tone={p.tone}>{lang === 'ha' ? p.ha : p.en}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted">
        {lang === 'ha' ? SOURCE_LABELS_LEARNER_HA[a.source] : SOURCE_LABELS_LEARNER[a.source]}
        {' · '}{formatDate(a.applied_at ?? a.interest_at ?? a.created_at)}
        {a.stage_changed_at && a.stage !== 'shortlisted' && <> · {t('updated', 'an sabunta')} {formatDate(a.stage_changed_at)}</>}
      </p>

      {!dimmed || p.state === 'closed' || p.state === 'not_selected' ? <Steps p={p} lang={lang} /> : null}

      {p.state === 'hired' && a.start_date && (
        <p className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-700">
          {t(`Congratulations. You start on ${formatDate(a.start_date)}. We will check in around ${formatDate(retentionDueOn(a.start_date))} to see how it is going.`,
            `Barka. Za ka fara a ranar ${formatDate(a.start_date)}. Za mu tuntuɓe ka kusan ${formatDate(retentionDueOn(a.start_date))}.`)}
        </p>
      )}
      {p.state === 'not_selected' && (
        <p className="mt-3 text-sm text-muted">{t('The employer chose someone else this time. Keep your Passport up to date: each graded project makes your next application stronger.', 'Mai ɗaukar aikin ya zaɓi wani wannan karon. Ci gaba da sabunta Fasfonka.')}</p>
      )}
      {p.state === 'active' && views > 0 && (
        <p className="mt-3 text-sm text-muted">{t(`The employer opened your Passport ${views} ${views === 1 ? 'time' : 'times'}.`, `Mai ɗaukar aikin ya buɗe Fasfonka sau ${views}.`)}</p>
      )}

      {(a.cover_note || a.match_reasons.length > 0) && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-blue">{t('What the employer sees', 'Abin da mai ɗaukar aikin yake gani')}</summary>
          <div className="mt-2 space-y-2 rounded-lg bg-canvas p-3">
            {a.match_reasons.length > 0 && (
              <ul className="space-y-0.5">
                {a.match_reasons.map((r) => <li key={r} className="flex gap-2"><span aria-hidden className="text-teal-700">✓</span>{r}</li>)}
                {a.match_concerns.map((r) => <li key={r} className="flex gap-2 text-muted"><span aria-hidden className="text-amber-800">!</span>{r}</li>)}
              </ul>
            )}
            {a.cover_note && <p className="whitespace-pre-line"><span className="font-semibold">{t('Your note:', 'Saƙonka:')}</span> {a.cover_note}</p>}
          </div>
        </details>
      )}

      {p.state === 'active' && <div className="mt-3"><WithdrawButton id={a.id} role={a.role_title} lang={lang} /></div>}
      {(p.state === 'withdrawn' || p.state === 'said_no') && a.on_board && (
        <p className="mt-3 text-sm"><Link href={`/jobs/${a.role_id}#apply`} className="font-semibold text-blue underline underline-offset-2">{t('Changed your mind? Apply again', 'Ka canza ra’ayi? Sake nema')}</Link></p>
      )}
    </Card>
  );
}

// Applied → Being reviewed → Interview → Offer → Hired, with the current step marked.
function Steps({ p, lang }: { p: ApplicationProgress; lang: Lang }) {
  const stopped = p.state === 'not_selected' || p.state === 'closed';
  return (
    <ol className="mt-4 grid grid-cols-5 gap-1" aria-label={lang === 'ha' ? 'Matakai' : 'Progress'}>
      {APPLICATION_STEPS.map((s, i) => {
        const done = i < p.step || (i === p.step && p.state === 'hired');
        const current = i === p.step && !done;
        return (
          <li key={s.key} className="min-w-0" aria-current={current ? 'step' : undefined}>
            <span aria-hidden className={cx('block h-1.5 rounded-full', done ? 'bg-teal-700' : current ? (stopped ? 'bg-line' : 'bg-blue') : 'bg-line')} />
            <span className={cx('mt-1.5 block truncate text-[11px] font-semibold', done || current ? 'text-ink' : 'text-muted')}>
              {lang === 'ha' ? s.ha : s.en}
              <span className="sr-only">{done ? (lang === 'ha' ? ' (an gama)' : ' (done)') : current ? (lang === 'ha' ? ' (yanzu)' : ' (current)') : ''}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
