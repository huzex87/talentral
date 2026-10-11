'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { withUser } from '@talentral/db';
import { requireHubRole } from '@/lib/auth';

const UUID = /^[0-9a-f-]{36}$/;

// Copies a published library course into the hub as a draft, then opens it for editing. The
// database checks the hub's role and the course (app.copy_library_course) and writes the audit entry.
export async function takeLibraryCourse(slug: string, courseId: string): Promise<void> {
  if (!UUID.test(courseId)) throw new Error('That course is not in the library.');
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  if (hub.kind !== 'hub') throw new Error('Only hubs can take courses from the library.');
  const [row] = await withUser(user.id, (tx) => tx<{ id: string }[]>`select app.copy_library_course(${hub.id}, ${courseId}) as id`);
  revalidatePath(`/dashboard/${slug}/courses`);
  revalidatePath(`/dashboard/${slug}/library`);
  redirect(`/dashboard/${slug}/courses/${row!.id}?copied=1`);
}
