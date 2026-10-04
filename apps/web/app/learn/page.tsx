import Link from 'next/link';
import { withUser } from '@talentral/db';
import { LESSON_KINDS, LESSON_KINDS_HA, label, pick, pickSurvey } from '@talentral/domain';
import { LearnerShell } from '@/components/learner-shell';
import { NpsPrompt } from '@/components/nps-prompt';
import { InstallCard } from '@/components/offline/install-card';
import { Badge, Card, EmptyState, LinkButton } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { dueTasks, learnerCourses, learnerLanguage, nextLesson, outline } from '@/lib/learn-data';
import { mySurveys } from '@/lib/nps';
import { WhatsAppPrompt } from '@/components/whatsapp-choice';
import { maskPhone, myWhatsApp } from '@/lib/whatsapp-data';
import { whatsappEnabled } from '@/lib/whatsapp';
import { MessagesSquare } from 'lucide-react';

export const metadata = { title: 'My learning' };

const TZ = { timeZone: 'Africa/Lagos' } as const;
const time = (d: Date) => new Intl.DateTimeFormat('en-GB', { ...TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);

type ScheduleRow = { session_id: string; cohort_id: string; cohort_name: string; hub_name: string; title: string; starts_at: Date; ends_at: Date;
  mode: 'in_person' | 'online' | 'hybrid'; location: string | null; facilitator: string | null; has_link: boolean; recording_url: string | null; my_status: string | null };

const JOIN_NOTES: Record<string, [string, string]> = {
  early: ['The class opens 10 minutes before it starts.', 'Ajin zai buɗe minti 10 kafin a fara.'],
  ended: ['That class has ended. Look for the recording below.', 'Wannan ajin ya ƙare. Duba rikodin a ƙasa.'],
  unavailable: ['That class is not available to you.', 'Ba za ka iya shiga wannan ajin ba.'],
};

export default async function Learn({ searchParams }: { searchParams: Promise<{ join?: string }> }) {
  const { join } = await searchParams;
  const user = await requireUser();
  const data = await withUser(user.id, async (tx) => {
    const language = await learnerLanguage(tx, user.id);
    const courses = await learnerCourses(tx);
    const withOutline = [];
    for (const c of courses) withOutline.push({ ...c, rows: c.course_id ? await outline(tx, c.cohort_id) : [] });
    const schedule = await tx<ScheduleRow[]>`select * from app.learner_schedule()`;
    const announcements = await tx<{ id: string; cohort_name: string; hub_name: string; title: string; body: string; created_at: Date; read: boolean }[]>`select * from app.learner_announcements()`;
    const unread = announcements.filter((a) => !a.read).map((a) => a.id);
    if (unread.length) await tx`select app.read_announcements(${unread}::uuid[])`;
    const survey = pickSurvey(await mySurveys(tx), 'learner', new Date());
    const whatsapp = whatsappEnabled() && withOutline.length ? await myWhatsApp(tx) : null;
    return { language, courses: withOutline, schedule, announcements, survey, whatsapp };
  });
  const { language: lang } = data;
  const first = (user.full_name ?? '').split(' ')[0];
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const tasks = data.courses.flatMap((c) => dueTasks(c.rows).map((r) => ({ ...r, cohort: c })));
  const continuing = data.courses.filter((c) => c.course_id);
  const now = Date.now();
  const joinable = (r: ScheduleRow) => r.has_link && now >= new Date(r.starts_at).getTime() - 10 * 60_000 && now <= new Date(r.ends_at).getTime();
  const upcoming = data.schedule.filter((r) => new Date(r.ends_at).getTime() >= now);
  const live = upcoming.find(joinable);
  const recordings = data.schedule.filter((r) => r.recording_url && new Date(r.ends_at).getTime() < now).reverse().slice(0, 5);

  return (
    <LearnerShell user={user} language={lang} active="learn">
      <section className="mb-8">
        <div>
          <p className="text-[13px] font-medium text-muted">{t('My learning', 'Karatuna')}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.025em] sm:text-[28px]">{first ? t(`Welcome back, ${first}`, `Barka da dawowa, ${first}`) : t('Welcome back', 'Barka da dawowa')}</h1>
          <p className="mt-1 text-[15px] text-muted">{tasks.length ? t(`You have ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} to do.`, `Kana da ayyuka ${tasks.length} da za ka yi.`) : t('You are up to date.', 'Babu aikin da ke jiranka.')}</p>
        </div>
      </section>

      {data.survey && <NpsPrompt tenantId={data.survey.tenantId} cohortId={data.survey.cohortId} audience="learner" hubName={data.survey.hubName} lang={lang} className="mb-6" />}
      {data.whatsapp?.state === 'undecided' && <WhatsAppPrompt lang={lang} masked={maskPhone(data.whatsapp.phones[0]!)} />}
      <InstallCard lang={lang} />
      {join && JOIN_NOTES[join] && <div className="mb-4 rounded-[var(--radius-control)] border border-amber-800/20 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">{t(...JOIN_NOTES[join])}</div>}
      {live && (
        <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] bg-midnight p-5 text-white sm:p-6" aria-label={t('Class now', 'Aji yanzu')}>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[13px] font-medium text-teal"><span className="size-2 animate-pulse rounded-full bg-teal" aria-hidden />{new Date(live.starts_at).getTime() > now ? t('Starting soon', 'Za a fara nan ba da jimawa ba') : t('Live now', 'Ana gudana yanzu')}</p>
            <p className="mt-1 font-display text-xl font-semibold">{live.title}</p>
            <p className="text-sm text-white/70">{live.cohort_name}{live.facilitator ? ` · ${live.facilitator}` : ''}</p>
          </div>
          <a href={`/learn/join/${live.session_id}`} target="_blank" rel="noopener" className="inline-flex h-10 items-center rounded-[var(--radius-control)] bg-white px-4 text-sm font-medium text-ink transition-colors hover:bg-white/90">{t('Join class', 'Shiga aji')} ↗</a>
        </section>
      )}
      {data.announcements.length > 0 && (
        <section className="mb-6" aria-label={t('Announcements', 'Sanarwa')}>
          <h2 className="mb-3 text-base font-semibold">{t('Announcements', 'Sanarwa')}</h2>
          <div className="space-y-2">
            {data.announcements.slice(0, 3).map((a) => (
              <Card key={a.id} className={a.read ? 'p-4' : 'border-blue/25 p-4 ring-1 ring-blue/10'}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{!a.read && <span className="mr-2 rounded-md bg-blue px-1.5 py-px text-[11px] font-medium text-white">{t('New', 'Sabo')}</span>}{a.title}</p>
                  <span className="text-xs text-muted">{a.hub_name} · {formatDate(a.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm">{a.body}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {data.courses.length === 0 ? (
        <EmptyState title={t('No courses yet', 'Babu darussa tukuna')}>{t('When a hub enrols you in a cohort, its course appears here.', 'Idan cibiya ta saka ka cikin rukuni, darussan za su bayyana a nan.')}</EmptyState>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            <section>
              <h2 className="mb-3 text-base font-semibold">{t('Continue learning', 'Ci gaba da karatu')}</h2>
              <div className="space-y-3">
                {continuing.length === 0 && <Card className="p-5 text-sm text-muted">{t('Your hub has not published a course for your cohort yet.', 'Cibiyarka ba ta wallafa darasi ga rukuninka ba tukuna.')}</Card>}
                {continuing.map((c) => {
                  const next = nextLesson(c.rows);
                  const pct = c.lessons ? Math.round((c.completed / c.lessons) * 100) : 0;
                  return (
                    <Card key={c.cohort_id} className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-muted">{c.hub_name} · {c.cohort_name}</p>
                          <Link href={`/learn/${c.cohort_id}`} className="mt-1 block font-display text-xl font-semibold hover:text-blue">{c.path_id ? pick(c.path_title ?? '', c.path_title_ha, lang).text : c.course_title}</Link>
                          {c.path_id && c.course_step !== null && (
                            <p className="mt-0.5 text-sm text-muted">{t(`Learning path · course ${c.course_step + 1} of ${c.courses_total}: ${c.course_title}`, `Hanyar koyo · kwas ${c.course_step + 1} cikin ${c.courses_total}: ${c.course_title}`)}</p>
                          )}
                        </div>
                        <span className="text-sm font-semibold text-muted">{c.completed}/{c.lessons} {t('lessons', 'darussa')}</span>
                      </div>
                      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.course_title} progress`}>
                        <div className="h-full rounded-full bg-blue" style={{ width: `${pct}%` }} />
                      </div>
                      {next ? (
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-canvas/60 p-3">
                          <div className="min-w-0 text-sm">
                            <p className="text-[13px] font-medium text-muted">{t('Up next', 'Na gaba')} · {label(LESSON_KINDS, LESSON_KINDS_HA, next.kind, lang)}</p>
                            <p className="truncate font-semibold">{pick(next.title, next.title_ha, lang).text}</p>
                          </div>
                          <LinkButton href={`/learn/${c.cohort_id}/${next.lesson_id}`} size="sm">{c.completed ? t('Continue', 'Ci gaba') : t('Start', 'Fara')}</LinkButton>
                        </div>
                      ) : c.lessons > 0 && <p className="mt-3 text-sm font-semibold text-teal-700">✓ {t('All open lessons done. New ones appear as modules open.', 'Ka kammala duk darussan da suke a buɗe.')}</p>}
                    </Card>
                  );
                })}
              </div>
            </section>
            {tasks.length > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-semibold">{t('To do', 'Abin da za ka yi')}</h2>
                <Card className="divide-y divide-line">
                  {tasks.map((task) => (
                    <Link key={task.lesson_id} href={`/learn/${task.cohort.cohort_id}/${task.lesson_id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-canvas/60">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{pick(task.title, task.title_ha, lang).text}</span>
                        <span className="text-xs text-muted">{task.cohort.course_title} · {label(LESSON_KINDS, LESSON_KINDS_HA, task.kind, lang)}</span>
                      </span>
                      {task.submission_status === 'resubmit' ? <Badge tone="amber">{t('Try again', 'Sake gwadawa')}</Badge> : <Badge tone="blue">{task.kind === 'quiz' ? t('Take quiz', 'Yi jarrabawa') : t('Hand in', 'Mika aiki')}</Badge>}
                    </Link>
                  ))}
                </Card>
              </section>
            )}
          </div>
          <aside className="space-y-4">
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-ink">{t('Classes', 'Azuzuwa')}</h2>
              {upcoming.length === 0 ? <p className="mt-3 text-sm text-muted">{t('Nothing in the next two weeks.', 'Babu komai a makonni biyu masu zuwa.')}</p> : (
                <ul className="mt-3 space-y-3" aria-label={t('Upcoming classes', 'Azuzuwa masu zuwa')}>
                  {upcoming.map((s) => (
                    <li key={s.session_id} className="text-sm">
                      <p className="font-semibold">{s.title}</p>
                      <p className="text-muted">{time(s.starts_at)} · {s.mode === 'online' ? t('Online', 'Ta intanet') : s.location ?? s.hub_name}</p>
                      {s.has_link && (joinable(s)
                        ? <a href={`/learn/join/${s.session_id}`} target="_blank" rel="noopener" className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-blue px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-600">{t('Join class', 'Shiga aji')} ↗</a>
                        : <p className="mt-1 text-xs text-muted">{t('Join opens 10 minutes before', 'Za a iya shiga minti 10 kafin')}</p>)}
                    </li>
                  ))}
                </ul>
              )}
              {recordings.length > 0 && (
                <div className="mt-4 border-t border-line pt-4">
                  <h3 className="text-[13px] font-medium text-muted">{t('Recordings', 'Rikodi')}</h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {recordings.map((s) => (
                      <li key={s.session_id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">{s.title}</span>
                        <a href={s.recording_url!} target="_blank" rel="noopener noreferrer" className="shrink-0 font-semibold text-blue hover:underline">{t('Watch', 'Kalla')} ↗</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-ink">{t('Your cohorts', 'Rukunanka')}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {data.courses.map((c) => (
                  <li key={c.cohort_id}>
                    <b>{c.programme_title}</b><span className="block text-muted">{c.cohort_name}{c.starts_on ? ` · ${formatDate(c.starts_on)}` : ''}</span>
                    <Link href={`/learn/${c.cohort_id}/discussion`} className="mt-1 inline-block text-xs font-semibold text-blue hover:underline"><MessagesSquare className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />{t('Class discussion', 'Tattaunawar aji')}</Link>
                  </li>
                ))}
              </ul>
            </Card>
          </aside>
        </div>
      )}
    </LearnerShell>
  );
}
