'use server';
import { revalidatePath } from 'next/cache';
import { withUser } from '@talentral/db';
import { APPLICATION_STATUSES, canMove, type ApplicationStatus } from '@talentral/domain';
import { hubAccess } from '@/lib/auth';

export async function moveApplication(slug: string, id: string, to: string) {
  const { user, hub } = await hubAccess(slug);
  if (!(APPLICATION_STATUSES as readonly string[]).includes(to)) throw new Error('Unknown status');
  await withUser(user.id, async (tx) => {
    const [a] = await tx<{ status: ApplicationStatus }[]>`select status from public.applications where id = ${id} and tenant_id = ${hub.id} for update`;
    if (!a) throw new Error('Application not found');
    if (!canMove(a.status, to as ApplicationStatus)) throw new Error(`Cannot move from ${a.status} to ${to}`);
    await tx`update public.applications set status = ${to} where id = ${id}`;
  });
  revalidatePath(`/dashboard/${slug}/applications`, 'layout');
}

export async function addNote(slug: string, id: string, form: FormData) {
  const { user, hub } = await hubAccess(slug);
  const body = String(form.get('body') ?? '').trim().slice(0, 2000);
  if (!body) return;
  await withUser(user.id, (tx) => tx`insert into public.application_notes (tenant_id, application_id, author_id, body) values (${hub.id}, ${id}, ${user.id}, ${body})`);
  revalidatePath(`/dashboard/${slug}/applications/${id}`);
}
