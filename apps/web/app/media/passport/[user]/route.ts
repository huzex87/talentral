// A learner's Passport photo, for people who can already see that Passport: the learner, talent
// officers, and employers the learner has shared with (row-level security decides). Private cache
// only; the address changes with each new upload.
import { withUser } from '@talentral/db';
import { currentUser } from '@/lib/auth';
import { storage } from '@/lib/storage';

export async function GET(_req: Request, { params }: { params: Promise<{ user: string }> }) {
  const { user: id } = await params;
  const viewer = await currentUser();
  if (!viewer || !/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
  const [row] = await withUser(viewer.id, (tx) => tx<{ photo_path: string | null }[]>`select photo_path from public.passports where user_id = ${id}`);
  if (!row?.photo_path) return new Response('Not found', { status: 404 });
  const bytes = await (await storage()).get(row.photo_path);
  if (!bytes) return new Response('Not found', { status: 404 });
  const type = row.photo_path.endsWith('.png') ? 'image/png' : row.photo_path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return new Response(Buffer.from(bytes), { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400' } });
}
