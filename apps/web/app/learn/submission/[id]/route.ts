// A submitted file, for the learner who handed it in or the hub team grading it.
import { withUser } from '@talentral/db';
import { currentUser } from '@/lib/auth';
import { serveStored } from '@/lib/uploads';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user || !/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
  const [f] = await withUser(user.id, (tx) => tx<{ file_path: string; file_name: string; file_type: string }[]>`select * from app.submission_file(${id})`);
  return f ? serveStored(f.file_path, f.file_name, f.file_type, true) : new Response('Not found', { status: 404 });
}
