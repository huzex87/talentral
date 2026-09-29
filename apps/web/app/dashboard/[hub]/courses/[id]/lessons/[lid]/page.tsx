import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { LESSON_KINDS, renderLessonText, videoEmbedUrl } from '@talentral/domain';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { skillOptions } from '@/lib/skills-data';
import { deleteLesson } from '../../../actions';
import { LessonForm, type LessonValues } from './lesson-form';
import { QuestionBuilder, type QuestionValues } from './question-builder';

export const metadata = { title: 'Edit lesson' };

export default async function LessonEditor({ params }: { params: Promise<{ hub: string; id: string; lid: string }> }) {
  const { hub: slug, id, lid } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(lid)) notFound();
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const data = await withUser(user.id, async (tx) => {
    const [lesson] = await tx<LessonValues[]>`select * from public.lessons where id = ${lid} and course_id = ${id} and tenant_id = ${hub.id}`;
    if (!lesson) return null;
    const [course] = await tx<{ title: string; tracks: string[] | null }[]>`
      select c.title, p.tracks from public.courses c left join public.programmes p on p.id = c.programme_id where c.id = ${id}`;
    const modules = await tx<{ id: string; title: string }[]>`select id, title from public.course_modules where course_id = ${id} order by position, created_at`;
    const questions = await tx<QuestionValues[]>`select id, kind, prompt, prompt_ha, options, correct, points, explanation from public.quiz_questions where lesson_id = ${lid} order by position, id`;
    const chosen = (await tx<{ skill_id: string }[]>`select skill_id from public.lesson_skills where lesson_id = ${lid}`).map((r) => r.skill_id);
    const skills = await skillOptions(tx, course?.tracks ?? []);
    return { lesson, course: course!, modules, questions, chosen, skills };
  });
  if (!data) notFound();
  const { lesson: l } = data;
  const embed = videoEmbedUrl(l.media_url);
  const preview = renderLessonText(l.body);

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader label={<Link href={`/dashboard/${slug}/courses/${id}`} className="hover:underline">← {data.course.title}</Link>} title={l.title}
        description={<Badge tone="blue">{LESSON_KINDS[l.kind]}</Badge>}
        actions={<form action={deleteLesson.bind(null, slug, id, l.id)}><Button variant="ghost" className="text-danger">Delete lesson</Button></form>} />
      <Card className="p-5 sm:p-6">
        <LessonForm slug={slug} courseId={id} lesson={l} modules={data.modules} skills={data.skills} chosenSkills={data.chosen} />
      </Card>
      {l.kind === 'quiz' && (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-3 text-lg font-semibold">Questions</h2>
          <QuestionBuilder slug={slug} courseId={id} lessonId={l.id} questions={data.questions} />
        </Card>
      )}
      {(preview || embed) && (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.12em] text-muted">Preview</h2>
          {embed && <div className="mb-4 aspect-video overflow-hidden rounded-xl bg-ink"><iframe src={embed} title={l.title} className="size-full" allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" /></div>}
          {preview && <div className="lesson-prose" dangerouslySetInnerHTML={{ __html: preview }} />}
        </Card>
      )}
    </div>
  );
}
