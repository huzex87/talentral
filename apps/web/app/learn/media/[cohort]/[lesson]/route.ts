// A lesson's file (PDF, audio or video) for an enrolled learner, once the lesson is open.
import { withUser } from '@talentral/db';
import { currentUser } from '@/lib/auth';
import { serveStored } from '@/lib/uploads';

export async function GET(req: Request, { params }: { params: Promise<{ cohort: string; lesson: string }> }) {
  const { cohort, lesson } = await params;
  const user = await currentUser();
  if (!user || !/^[0-9a-f-]{36}$/.test(cohort) || !/^[0-9a-f-]{36}$/.test(lesson)) return new Response('Not found', { status: 404 });
  const [f] = await withUser(user.id, (tx) => tx<{ file_path: string; file_name: string; file_type: string }[]>`select * from app.lesson_file(${cohort}, ${lesson})`);
  if (!f) return new Response('Not found', { status: 404 });
  return serveStored(f.file_path, f.file_name, f.file_type, new URL(req.url).searchParams.has('download'));
}
