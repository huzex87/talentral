import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { ThreadList } from '@/components/discussion';
import { LearnerShell } from '@/components/learner-shell';
import { requireUser } from '@/lib/auth';
import { cohortThreads, discussionRole } from '@/lib/discussion-data';
import { translator } from '@/lib/i18n';
import { learnerCourses } from '@/lib/learn-data';

export const metadata = { title: 'Discussion' };

export default async function LearnerDiscussion({ params }: { params: Promise<{ cohort: string }> }) {
  const { cohort } = await params;
  if (!/^[0-9a-f-]{36}$/.test(cohort)) notFound();
  const user = await requireUser();
  const data = await withUser(user.id, async (tx) => {
    if ((await discussionRole(tx, cohort)) !== 'learner') return null;
    const course = (await learnerCourses(tx)).find((c) => c.cohort_id === cohort);
    return { course, threads: await cohortThreads(tx, cohort) };
  });
  if (!data) notFound();
  const lang = user.language;
  const t = translator(lang);
  return (
    <LearnerShell user={user} language={lang} active="learn">
      <div className="mx-auto max-w-3xl">
        <Link href={data.course?.course_id ? `/learn/${cohort}` : '/learn'} className="text-sm font-semibold text-violet hover:underline">← {data.course?.course_title ?? t('My learning', 'Karatuna')}</Link>
        <h1 className="mt-1 text-3xl font-semibold">{t('Discussion', 'Tattaunawa')}</h1>
        <p className="mb-6 mt-1 text-[15px] text-muted">{data.course?.cohort_name} · {t('Ask your classmates and the hub team. Be kind; the hub can hide posts that break the rules.', 'Tambayi abokan karatunka da ma’aikatan cibiya. Ka kasance mai ladabi; cibiyar za ta iya ɓoye rubutun da ya saɓa ƙa’ida.')}</p>
        <ThreadList cohortId={cohort} threads={data.threads} base={`/learn/${cohort}/discussion`} lang={lang} />
      </div>
    </LearnerShell>
  );
}
