'use server';
// Support access (E13.1): platform staff give a reason to open a hub's dashboard for four hours.
// The hub's owners are emailed, and the session shows in the hub's audit log and overview.
import { redirect } from 'next/navigation';
import { withUser } from '@talentral/db';
import { watTime } from '@talentral/domain';
import { requirePlatformAdmin } from '@/lib/auth';
import { env } from '@/lib/env';
import { sendMailBatch, supportStartedMail } from '@/lib/mail';

export interface SupportState { message?: string }

const SLUG = /^[a-z0-9-]{2,63}$/;

export async function startSupport(slug: string, _prev: SupportState, form: FormData): Promise<SupportState> {
  const user = await requirePlatformAdmin();
  if (!SLUG.test(slug)) return { message: 'That hub could not be found.' };
  const reason = String(form.get('reason') ?? '').trim().slice(0, 500);
  if (reason.length < 10) return { message: 'Say why you need access, in at least 10 characters. The hub’s owners will see it.' };
  const result = await withUser(user.id, async (tx) => {
    const [hub] = await tx<{ id: string; name: string }[]>`select id, name from public.tenants where slug = ${slug}`;
    if (!hub) return null;
    const [started] = await tx<{ until: Date }[]>`select app.start_support(${hub.id}, ${reason}) as until`;
    const owners = await tx<{ email: string }[]>`
      select u.email::text from public.memberships m join public.users u on u.id = m.user_id where m.tenant_id = ${hub.id} and m.role = 'owner'`;
    return { hub, until: started!.until, owners };
  });
  if (!result) return { message: 'That hub could not be found.' };
  const when = watTime(new Date(result.until));
  await sendMailBatch(result.owners.map((o) => supportStartedMail(o.email, result.hub.name, user.full_name || user.email, reason, when, `${env.appUrl}/dashboard/${slug}/audit`)))
    .catch((e) => console.error('support notice failed', e));
  redirect(`/dashboard/${slug}`);
}

export async function endSupport(slug: string): Promise<void> {
  const user = await requirePlatformAdmin();
  await withUser(user.id, async (tx) => {
    const [hub] = await tx<{ id: string }[]>`select id from public.tenants where slug = ${slug}`;
    if (hub) await tx`select app.end_support(${hub.id})`;
  });
  redirect('/platform');
}
