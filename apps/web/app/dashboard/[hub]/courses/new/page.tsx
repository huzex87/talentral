import { withUser } from '@talentral/db';
import { CreateScreen } from '@/components/create-screen';
import { requireHubRole } from '@/lib/auth';
import { NewCourseForm } from '../forms';

export const metadata = { title: 'New course' };

export default async function NewCourse({ params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const programmes = await withUser(user.id, (tx) => tx<{ id: string; title: string }[]>`select id, title from public.programmes where tenant_id = ${hub.id} order by created_at desc`);
  return (
    <CreateScreen back={`/dashboard/${slug}/courses`} backLabel="Courses" label="Learning" title="New course"
      description="Start with a title. The course opens with one module, ready for its first lesson."
      next={['Add lessons: reading, video, audio, PDF, quizzes and assignments.', 'Drag modules and lessons into the order learners should follow.', 'Publish it and choose it for a cohort.']}>
      <NewCourseForm slug={slug} programmes={programmes} />
    </CreateScreen>
  );
}
