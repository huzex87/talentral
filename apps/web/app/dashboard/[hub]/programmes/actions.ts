'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { withUser, type Programme } from '@talentral/db';
import { RECOMMENDED_FIELDS, referencePrefix, slugProblem, slugify, validateFormDefinition, type FormField } from '@talentral/domain';
import { requireHubRole } from '@/lib/auth';
import { fromLocalInput } from '@/lib/format';

export interface ProgState { ok?: boolean; message?: string; errors?: Record<string, string> }

export async function createProgramme(slug: string, _prev: ProgState, form: FormData): Promise<ProgState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const title = String(form.get('title') ?? '').trim();
  if (title.length < 3) return { errors: { title: 'Give your programme a title.' } };
  const base = slugify(title) || 'programme';
  const id = await withUser(user.id, async (tx) => {
    const taken = new Set((await tx<{ slug: string }[]>`select slug from public.programmes where tenant_id = ${hub.id}`).map((r) => r.slug));
    let s = base.length >= 3 ? base : `${base}-call`;
    for (let n = 2; taken.has(s); n += 1) s = `${base}-${n}`;
    const [row] = await tx<{ id: string }[]>`
      insert into public.programmes (tenant_id, slug, title, form, reference_prefix)
      values (${hub.id}, ${s}, ${title}, ${tx.json(RECOMMENDED_FIELDS as never)}, ${referencePrefix(hub.slug)}) returning id`;
    await tx`select app.audit(${hub.id}, 'programme.created', 'programme', ${row!.id})`;
    return row!.id;
  });
  redirect(`/dashboard/${slug}/programmes/${id}?created=1`);
}

const details = z.object({
  title: z.string().trim().min(3, 'Enter a title.').max(160),
  slug: z.string().trim().toLowerCase(),
  summary: z.string().trim().max(300),
  description: z.string().trim().max(8000),
  eligibility: z.string().trim().max(3000),
  tracks: z.string().max(2000),
  opens_at: z.string(),
  closes_at: z.string(),
  capacity: z.string().regex(/^\d{0,6}$/, 'Enter a whole number.'),
});

export async function saveDetails(slug: string, id: string, _prev: ProgState, form: FormData): Promise<ProgState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const parsed = details.safeParse(Object.fromEntries(Object.keys(details.shape).map((k) => [k, String(form.get(k) ?? '')])));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors, message: 'Please check the highlighted fields.' };
  }
  const d = parsed.data;
  const errors: Record<string, string> = {};
  const slugErr = slugProblem(d.slug);
  if (slugErr) errors.slug = slugErr;
  const tracks = [...new Set(d.tracks.split('\n').map((t) => t.trim()).filter(Boolean))];
  if (tracks.length > 20) errors.tracks = 'Use at most 20 tracks.';
  const opens = fromLocalInput(d.opens_at);
  const closes = fromLocalInput(d.closes_at);
  if (opens && closes && closes <= opens) errors.closes_at = 'The closing date must be after the opening date.';
  if (Object.keys(errors).length) return { errors, message: 'Please check the highlighted fields.' };
  try {
    await withUser(user.id, async (tx) => {
      await tx`update public.programmes set title = ${d.title}, slug = ${d.slug}, summary = ${d.summary || null},
        description = ${d.description || null}, eligibility = ${d.eligibility || null}, tracks = ${tx.json(tracks)},
        opens_at = ${opens}, closes_at = ${closes}, capacity = ${d.capacity ? Number(d.capacity) : null}
        where id = ${id} and tenant_id = ${hub.id}`;
      await tx`select app.audit(${hub.id}, 'programme.updated', 'programme', ${id})`;
    });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return { errors: { slug: 'Another programme already uses this address.' } };
    throw e;
  }
  revalidatePath(`/dashboard/${slug}/programmes`, 'layout');
  return { ok: true, message: 'Details saved.' };
}

export async function saveForm(slug: string, id: string, fields: FormField[]): Promise<ProgState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const clean = fields.map((f) => ({
    id: f.id, label: f.label.trim(), type: f.type, required: Boolean(f.required),
    ...(f.help?.trim() ? { help: f.help.trim() } : {}),
    ...(f.type === 'select' || f.type === 'multi_select' ? { options: (f.options ?? []).map((o) => o.trim()).filter(Boolean) } : {}),
    ...(f.maxLength ? { maxLength: f.maxLength } : {}),
  })) as FormField[];
  const problems = validateFormDefinition(clean);
  if (problems.length) return { message: problems.join(' ') };
  const [locked] = await withUser(user.id, (tx) => tx<{ n: number }[]>`select count(*)::int as n from public.applications where programme_id = ${id}`);
  await withUser(user.id, async (tx) => {
    await tx`update public.programmes set form = ${tx.json(clean as never)} where id = ${id} and tenant_id = ${hub.id}`;
    await tx`select app.audit(${hub.id}, 'programme.form_updated', 'programme', ${id}, ${tx.json({ questions: clean.length })})`;
  });
  revalidatePath(`/dashboard/${slug}/programmes/${id}`);
  return { ok: true, message: (locked?.n ?? 0) > 0 ? 'Form saved. Earlier applicants keep the answers they gave.' : 'Form saved.' };
}

export async function setStatus(slug: string, id: string, status: Programme['status']): Promise<ProgState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  if (status === 'open') {
    if (!hub.profile_completed_at) return { message: 'Complete your hub profile before opening applications.' };
    const [p] = await withUser(user.id, (tx) => tx<Programme[]>`select * from public.programmes where id = ${id} and tenant_id = ${hub.id}`);
    if (!p) return { message: 'Programme not found.' };
    const problems = validateFormDefinition(p.form as FormField[]);
    if (problems.length) return { message: `Fix the application form first: ${problems[0]}` };
    if (p.closes_at && new Date(p.closes_at) <= new Date()) return { message: 'The closing date has passed. Set a new closing date first.' };
    if (!p.summary) return { message: 'Add a short summary so applicants know what the programme is.' };
  }
  await withUser(user.id, async (tx) => {
    await tx`update public.programmes set status = ${status} where id = ${id} and tenant_id = ${hub.id}`;
    await tx`select app.audit(${hub.id}, 'programme.status', 'programme', ${id}, ${tx.json({ status })})`;
  });
  revalidatePath(`/dashboard/${slug}/programmes`, 'layout');
  revalidatePath(`/${slug}`, 'layout');
  return { ok: true, message: status === 'open' ? 'Applications are open.' : status === 'closed' ? 'Applications are closed.' : 'Moved back to draft.' };
}
