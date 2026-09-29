import Link from 'next/link';
import { withUser } from '@talentral/db';
import { LESSON_KINDS, pick } from '@talentral/domain';
import { LearnerShell } from '@/components/learner-shell';
import { Badge, Card, EmptyState, LinkButton } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { dueTasks, learnerCourses, learnerLanguage, nextLesson, outline } from '@/lib/learn-data';

export const metadata = { title: 'My learning' };

const TZ = { timeZone: 'Africa/Lagos' } as const;
const time = (d: Date) => new Intl.DateTimeFormat('en-GB', { ...TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);

export default async function Learn() {
  const user = await requireUser();
  const data = await withUser(user.id, async (tx) => {
    const language = await learnerLanguage(tx, user.id);
    const courses = await learnerCourses(tx);
    const withOutline = [];
    for (const c of courses) withOutline.push({ ...c, rows: c.course_id ? await outline(tx, c.cohort_id) : [] });
    const sessions = await tx<{ cohort_id: string; cohort_name: string; hub_name: string; title: string; starts_at: Date; ends_at: Date; mode: string; location: string | null }[]>`select * from app.learner_sessions()`;
    return { language, courses: withOutline, sessions };
  });
  const { language: lang } = data;
  const first = (user.full_name ?? '').split(' ')[0];
  const t = (en: string, ha: string) => (lang === 'ha' ? ha : en);
  const tasks = data.courses.flatMap((c) => dueTasks(c.rows).map((r) => ({ ...r, cohort: c })));
  const continuing = data.courses.filter((c) => c.course_id);

  return (
    <LearnerShell user={user} language={lang} active="learn">
      <section className="relative mb-6 overflow-hidden rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(50%_80%_at_100%_0%,rgba(46,91,255,0.10),transparent),radial-gradient(40%_70%_at_0%_100%,rgba(124,58,237,0.08),transparent)]" />
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">{t('My learning', 'Karatuna')}</p>
          <h1 className="mt-1 text-3xl font-semibold">{first ? t(`Welcome back, ${first}`, `Barka da dawowa, ${first}`) : t('Welcome back', 'Barka da dawowa')}</h1>
          <p className="mt-1 text-[15px] text-muted">{tasks.length ? t(`You have ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} to do.`, `Kana da ayyuka ${tasks.length} da za ka yi.`) : t('You are up to date.', 'Babu aikin da ke jiranka.')}</p>
        </div>
      </section>

      {data.courses.length === 0 ? (
        <EmptyState title={t('No courses yet', 'Babu darussa tukuna')}>{t('When a hub enrols you in a cohort, its course appears here.', 'Idan cibiya ta saka ka cikin rukuni, darussan za su bayyana a nan.')}</EmptyState>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-6">
            <section>
              <h2 className="mb-3 text-lg font-semibold">{t('Continue learning', 'Ci gaba da karatu')}</h2>
              <div className="space-y-3">
                {continuing.length === 0 && <Card className="p-5 text-sm text-muted">{t('Your hub has not published a course for your cohort yet.', 'Cibiyarka ba ta wallafa darasi ga rukuninka ba tukuna.')}</Card>}
                {continuing.map((c) => {
                  const next = nextLesson(c.rows);
                  const pct = c.lessons ? Math.round((c.completed / c.lessons) * 100) : 0;
                  return (
                    <Card key={c.cohort_id} className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold uppercase tracking-[0.1em] text-muted">{c.hub_name} · {c.cohort_name}</p>
                          <Link href={`/learn/${c.cohort_id}`} className="mt-1 block font-display text-xl font-semibold hover:text-blue">{c.course_title}</Link>
                        </div>
                        <span className="text-sm font-semibold text-muted">{c.completed}/{c.lessons} {t('lessons', 'darussa')}</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.course_title} progress`}>
                        <div className="h-full rounded-full bg-[linear-gradient(90deg,#7C3AED,#2E5BFF)]" style={{ width: `${pct}%` }} />
                      </div>
                      {next ? (
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-canvas/70 p-3">
                          <div className="min-w-0 text-sm">
                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{t('Up next', 'Na gaba')} · {LESSON_KINDS[next.kind]}</p>
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
                        <span className="text-xs text-muted">{task.cohort.course_title} · {LESSON_KINDS[task.kind]}</span>
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
              <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">{t('Upcoming sessions', 'Zaman da ke tafe')}</h2>
              {data.sessions.length === 0 ? <p className="mt-3 text-sm text-muted">{t('Nothing in the next two weeks.', 'Babu komai a makonni biyu masu zuwa.')}</p> : (
                <ul className="mt-3 space-y-3">
                  {data.sessions.map((s) => (
                    <li key={`${s.cohort_id}-${s.starts_at.toISOString()}`} className="text-sm">
                      <p className="font-semibold">{s.title}</p>
                      <p className="text-muted">{time(s.starts_at)} · {s.mode === 'online' ? t('Online', 'Ta intanet') : s.location ?? s.hub_name}</p>
                    </li>
                  ))}
                </ul>
              )}
              {data.courses[0]?.hub_slug && <p className="mt-4 text-xs text-muted">{t('At the session, check in with the class code.', 'A zaman, shiga da lambar aji.')}</p>}
            </Card>
            <Card className="p-5">
              <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">{t('Your cohorts', 'Rukunanka')}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {data.courses.map((c) => <li key={c.cohort_id}><b>{c.programme_title}</b><span className="block text-muted">{c.cohort_name}{c.starts_on ? ` · ${formatDate(c.starts_on)}` : ''}</span></li>)}
              </ul>
            </Card>
          </aside>
        </div>
      )}
    </LearnerShell>
  );
}
