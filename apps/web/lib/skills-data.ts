import 'server-only';
// The skills a hub can use: the shared platform taxonomy plus the hub's own skills (which RLS
// limits to its members). Skills on the programme's tracks are suggested first.
import type { Tx } from '@talentral/db';

export interface SkillOption { id: string; name: string; track: string; hub: boolean; suggested: boolean }

export async function skillOptions(tx: Tx, tracks: string[]): Promise<SkillOption[]> {
  const rows = await tx<{ id: string; name: string; track: string; hub: boolean }[]>`
    select id, name, track, tenant_id is not null as hub from public.skills order by track, tenant_id is null, name`;
  const wanted = new Set(tracks.map((t) => t.trim().toLowerCase()));
  return rows.map((r) => ({ ...r, suggested: wanted.has(r.track.toLowerCase()) }));
}
