'use server';
import { revalidatePath } from 'next/cache';
import { withUser } from '@talentral/db';
import { requireHubRole } from '@/lib/auth';

export interface SkillState { ok?: boolean; message?: string; errors?: Record<string, string> }

// A hub skill always sits on a track and, ideally, maps to the platform skill it is a form of,
// so evidence from this hub counts the same as evidence from any other.
export async function addSkill(slug: string, _prev: SkillState, form: FormData): Promise<SkillState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const name = String(form.get('name') ?? '').replace(/\s+/g, ' ').trim();
  const track = String(form.get('track') ?? '').replace(/\s+/g, ' ').trim();
  const description = String(form.get('description') ?? '').trim();
  const mapsTo = String(form.get('maps_to') ?? '');
  const errors: Record<string, string> = {};
  if (name.length < 2 || name.length > 60) errors.name = 'Name the skill in 2 to 60 characters.';
  if (track.length < 2 || track.length > 80) errors.track = 'Choose or type a track.';
  if (description.length > 200) errors.description = 'Keep the description under 200 characters.';
  if (mapsTo && !/^[0-9a-f-]{36}$/.test(mapsTo)) errors.maps_to = 'Choose a platform skill.';
  if (Object.keys(errors).length) return { errors, message: 'Please check the highlighted fields.' };
  try {
    await withUser(user.id, async (tx) => {
      await tx`insert into public.skills (tenant_id, track, name, description, maps_to)
               values (${hub.id}, ${track}, ${name}, ${description || null}, ${mapsTo || null})`;
      await tx`select app.audit(${hub.id}, 'skill.added', 'skill', null, ${tx.json({ name, track })})`;
    });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { errors: { name: 'This track already has a skill with that name.' } };
    throw e;
  }
  revalidatePath(`/dashboard/${slug}/skills`);
  return { ok: true, message: `“${name}” added to ${track}.` };
}

export async function removeSkill(slug: string, id: string): Promise<void> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  await withUser(user.id, (tx) => tx`delete from public.skills where id = ${id} and tenant_id = ${hub.id}`);
  revalidatePath(`/dashboard/${slug}/skills`);
}
