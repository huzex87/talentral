// Downloads an applicant's document. Row-Level Security decides access: only the hub's team
// (and platform admins) can see the file record, so everyone else gets a 404.
import { withUser } from '@talentral/db';
import { currentUser } from '@/lib/auth';
import { storage } from '@/lib/storage';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user || !/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
  const [file] = await withUser(user.id, async (tx) => {
    const rows = await tx<{ tenant_id: string; application_id: string; storage_path: string; filename: string; content_type: string }[]>`
      select tenant_id, application_id, storage_path, filename, content_type from public.application_files where id = ${id}`;
    if (rows[0]) await tx`select app.audit(${rows[0].tenant_id}, 'file.downloaded', 'application', ${rows[0].application_id}, ${tx.json({ file: id })})`;
    return rows;
  });
  if (!file) return new Response('Not found', { status: 404 });
  const bytes = await (await storage()).get(file.storage_path);
  if (!bytes) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': file.content_type,
      'Content-Disposition': `attachment; filename="${file.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
