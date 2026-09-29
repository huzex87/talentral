// Public hub logo. Logos are stored privately and served here with long cache headers
// (the URL carries a version, so a new upload changes the address).
import { withUser, type Tenant } from '@talentral/db';
import { storage } from '@/lib/storage';

export async function GET(_req: Request, { params }: { params: Promise<{ hub: string }> }) {
  const { hub } = await params;
  const [row] = await withUser(null, (tx) => tx<Pick<Tenant, 'logo_path'>[]>`select logo_path from public.tenants where slug = ${hub}`);
  if (!row?.logo_path) return new Response('Not found', { status: 404 });
  const bytes = await (await storage()).get(row.logo_path);
  if (!bytes) return new Response('Not found', { status: 404 });
  const type = row.logo_path.endsWith('.png') ? 'image/png' : row.logo_path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return new Response(Buffer.from(bytes), { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' } });
}
