// Public partner logo for a programme page. Row-Level Security shows partners only where their
// programme is visible, so logos of draft programmes stay private.
import { withUser } from '@talentral/db';
import { storage } from '@/lib/storage';
import { imageResponse } from '@/lib/files';

export async function GET(_req: Request, { params }: { params: Promise<{ hub: string; id: string }> }) {
  const { hub, id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 });
  const [row] = await withUser(null, (tx) => tx<{ logo_path: string }[]>`
    select pp.logo_path from public.programme_partners pp join public.tenants t on t.id = pp.tenant_id
    where pp.id = ${id} and t.slug = ${hub}`);
  if (!row) return new Response('Not found', { status: 404 });
  const bytes = await (await storage()).get(row.logo_path);
  return bytes ? imageResponse(row.logo_path, bytes) : new Response('Not found', { status: 404 });
}
