// Lesson files for the hub team (previewing a course). Learners use /learn/media instead.
import { withUser } from '@talentral/db';
import { requireHubRole } from '@/lib/auth';
import { serveStored } from '@/lib/uploads';

export async function GET(_req: Request, { params }: { params: Promise<{ hub: string; lid: string }> }) {
  const { hub: slug, lid } = await params;
  if (!/^[0-9a-f-]{36}$/.test(lid)) return new Response('Not found', { status: 404 });
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin', 'reviewer']);
  const [f] = await withUser(user.id, (tx) => tx<{ file_path: string; file_name: string; file_type: string }[]>`
    select file_path, file_name, file_type from public.lessons where id = ${lid} and tenant_id = ${hub.id} and file_path is not null`);
  return f ? serveStored(f.file_path, f.file_name, f.file_type) : new Response('Not found', { status: 404 });
}
