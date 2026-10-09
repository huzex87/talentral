// Public hub cover photo, shown across the top of the hub's page. Stored privately, served here
// with long cache headers (the URL carries a version, so a new upload changes the address).
import { withUser } from '@talentral/db';
import { storage } from '@/lib/storage';

export async function GET(_req: Request, { params }: { params: Promise<{ hub: string }> }) {
  const { hub } = await params;
  const [row] = await withUser(null, (tx) => tx<{ cover_path: string | null }[]>`select cover_path from public.tenants where slug = ${hub}`);
  if (!row?.cover_path) return new Response('Not found', { status: 404 });
  const bytes = await (await storage()).get(row.cover_path);
  if (!bytes) return new Response('Not found', { status: 404 });
  const type = row.cover_path.endsWith('.png') ? 'image/png' : row.cover_path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return new Response(Buffer.from(bytes), { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' } });
}
