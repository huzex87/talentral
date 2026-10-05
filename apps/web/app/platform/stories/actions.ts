'use server';
// Founding-hub case studies (MVP-2 month 12). Platform staff write them with the hub and publish
// them once the hub has agreed; publishing is audited with that agreement.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { withUser } from '@talentral/db';
import { parseStoryMetrics, slugify } from '@talentral/domain';
import { requirePlatformAdmin } from '@/lib/auth';

export interface StoryState { ok?: boolean; message?: string; errors?: Record<string, string>; values?: Record<string, string> }

const schema = z.object({
  title: z.string().trim().min(5, 'Use at least 5 characters.').max(140),
  slug: z.string().trim().toLowerCase().max(80),
  tenant_id: z.string().regex(/^([0-9a-f-]{36})?$/),
  summary: z.string().trim().min(20, 'Write a summary of at least 20 characters.').max(400, 'Keep the summary under 400 characters.'),
  body: z.string().trim().max(20000),
  metrics: z.string().max(1000),
  quote: z.string().trim().max(500),
  quote_by: z.string().trim().max(120),
});

export async function saveStory(id: string | null, _prev: StoryState, form: FormData): Promise<StoryState> {
  const user = await requirePlatformAdmin();
  const values = Object.fromEntries(Object.keys(schema.shape).map((k) => [k, String(form.get(k) ?? '')]));
  const parsed = schema.safeParse(values);
  const errors: Record<string, string> = {};
  if (!parsed.success) for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
  const m = parseStoryMetrics(values.metrics ?? '');
  if (m.error) errors.metrics = m.error;
  const d = parsed.success ? parsed.data : null;
  const slug = d ? (d.slug || slugify(d.title)).slice(0, 80) : '';
  if (d && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) errors.slug = 'Use lowercase letters, numbers and hyphens.';
  if (d && d.quote && !d.quote_by) errors.quote_by = 'Say who said it.';
  if (Object.keys(errors).length || !d) return { errors, values, message: 'Please check the highlighted fields.' };
  let newId = id;
  try {
    await withUser(user.id, async (tx) => {
      const row = { slug, tenant_id: d.tenant_id || null, title: d.title, summary: d.summary, body: d.body, metrics: tx.json(m.metrics as never), quote: d.quote || null, quote_by: d.quote_by || null };
      if (id) await tx`update public.case_studies set ${tx(row)} where id = ${id}`;
      else newId = (await tx<{ id: string }[]>`insert into public.case_studies ${tx({ ...row, created_by: user.id })} returning id`)[0]!.id;
    });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { errors: { slug: 'Another story uses this address.' }, values, message: 'Please check the highlighted fields.' };
    throw e;
  }
  revalidatePath('/platform/stories');
  revalidatePath('/stories');
  if (!id) redirect(`/platform/stories/${newId}?created=1`);
  return { ok: true, message: 'Saved.' };
}

export async function publishStory(id: string, _prev: StoryState, form: FormData): Promise<StoryState> {
  const user = await requirePlatformAdmin();
  const consent = String(form.get('consent') ?? '').trim();
  if (consent.length < 10) return { errors: { consent: 'Record who at the hub agreed to publication, and when.' } };
  await withUser(user.id, (tx) => tx`update public.case_studies set status = 'published', consent_note = ${consent.slice(0, 300)}, published_at = coalesce(published_at, now()) where id = ${id}`);
  revalidatePath('/platform/stories'); revalidatePath(`/platform/stories/${id}`); revalidatePath('/stories'); revalidatePath('/');
  return { ok: true, message: 'Published.' };
}

export async function unpublishStory(id: string): Promise<void> {
  const user = await requirePlatformAdmin();
  await withUser(user.id, (tx) => tx`update public.case_studies set status = 'draft' where id = ${id}`);
  revalidatePath('/platform/stories'); revalidatePath(`/platform/stories/${id}`); revalidatePath('/stories'); revalidatePath('/');
}

export async function deleteStory(id: string): Promise<void> {
  const user = await requirePlatformAdmin();
  await withUser(user.id, (tx) => tx`delete from public.case_studies where id = ${id} and status = 'draft'`);
  revalidatePath('/platform/stories');
  redirect('/platform/stories');
}
