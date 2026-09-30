'use server';
import { withUser } from '@talentral/db';
import { requireUser } from '@/lib/auth';

// Turns WhatsApp messages on or off for every number on the person's account and applications.
// Nothing is revalidated, so the confirmation stays on screen.
export async function setWhatsApp(on: boolean): Promise<{ ok: boolean; numbers: number }> {
  const user = await requireUser();
  const [r] = await withUser(user.id, (tx) => tx<{ n: number }[]>`select app.set_my_whatsapp(${on}) as n`);
  return { ok: true, numbers: r?.n ?? 0 };
}
