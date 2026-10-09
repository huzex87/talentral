import 'server-only';
// Data-subject requests (E13.2, NDPA): a person asks for their data to be deleted or corrected; the
// platform team works the queue within 30 days. Erasure itself is app.erase_person, which keeps only
// anonymous records; this module deletes the stored files it returns and sends the emails.
import { system, withUser } from '@talentral/db';
import { env } from './env';
import { formatDate } from './format';
import { dataRequestClosedMail, dataRequestNoticeMail, dataRequestReceivedMail, erasureDoneMail, sendMail, sendMailBatch } from './mail';
import { storage } from './storage';

export type RequestKind = 'erasure' | 'correction';
export interface DataRequest {
  id: string; kind: RequestKind; details: string | null; status: 'open' | 'completed' | 'declined' | 'cancelled';
  email_masked: string; due_at: Date; created_at: Date; handled_at: Date | null; outcome: string | null;
}

export async function myRequests(userId: string): Promise<DataRequest[]> {
  return withUser(userId, (tx) => tx<DataRequest[]>`
    select id, kind, details, status, email_masked, due_at, created_at, handled_at, outcome from public.data_requests
    where user_id = ${userId} order by created_at desc`);
}

export async function createRequest(user: { id: string; email: string }, kind: RequestKind, details: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const [row] = await withUser(user.id, (tx) => tx<{ id: string }[]>`select app.request_data_change(${kind}, ${details}) as id`);
    const [req] = await withUser(user.id, (tx) => tx<{ due_at: Date; email_masked: string }[]>`select due_at, email_masked from public.data_requests where id = ${row!.id}`);
    const due = formatDate(req!.due_at);
    await sendMail(dataRequestReceivedMail(user.email, kind, due, `${env.appUrl}/account/privacy`)).catch((e) => console.error('request receipt failed', e));
    const admins = await system()<{ email: string }[]>`select email::text from public.users where is_platform_admin`;
    await sendMailBatch(admins.map((a) => dataRequestNoticeMail(a.email, kind, req!.email_masked, due, `${env.appUrl}/platform/privacy`))).catch(() => 0);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (/already have a request open/.test(message)) return { ok: false, message: 'You already have a request of this kind open. We will reply by its due date.' };
    if (/Say what needs correcting/.test(message)) return { ok: false, message: 'Say what needs correcting, in at least 10 characters.' };
    throw e;
  }
}

export async function cancelRequest(userId: string, id: string): Promise<void> {
  await withUser(userId, (tx) => tx`select app.cancel_data_request(${id})`);
}

// The email address behind an open request, read before anything is deleted so we can reply.
async function requesterEmail(id: string): Promise<string | null> {
  const [r] = await system()<{ email: string | null }[]>`select u.email::text from public.data_requests d left join public.users u on u.id = d.user_id where d.id = ${id}`;
  return r?.email ?? null;
}

export async function eraseForRequest(adminId: string, id: string): Promise<{ ok: true; files: number } | { ok: false; message: string }> {
  const email = await requesterEmail(id);
  // The Passport photo lives in storage too; note its path before the account goes.
  const [photo] = email ? await system()<{ photo_path: string }[]>`
    select p.photo_path from public.passports p join public.users u on u.id = p.user_id where u.email = ${email} and p.photo_path is not null` : [];
  let paths: string[];
  try {
    const [r] = await withUser(adminId, (tx) => tx<{ paths: string[] }[]>`select app.erase_person(${id}) as paths`);
    paths = [...(r?.paths ?? []), ...(photo ? [photo.photo_path] : [])];
  } catch (e) {
    const message = e instanceof Error ? e.message : 'That could not be done.';
    if (/only owner of a hub|platform admin rights|no longer open|no longer exists/.test(message)) return { ok: false, message };
    throw e;
  }
  const store = await storage();
  for (const p of paths) await store.remove(p).catch((e) => console.error('could not remove file', p, e));
  if (email) await sendMail(erasureDoneMail(email)).catch((e) => console.error('erasure notice failed', e));
  return { ok: true, files: paths.length };
}

export async function closeRequest(adminId: string, id: string, status: 'completed' | 'declined', outcome: string): Promise<void> {
  const email = await requesterEmail(id);
  const [r] = await system()<{ kind: RequestKind }[]>`select kind from public.data_requests where id = ${id}`;
  await withUser(adminId, (tx) => tx`select app.close_data_request(${id}, ${status}, ${outcome})`);
  if (email && r) await sendMail(dataRequestClosedMail(email, r.kind, status, outcome.trim() || null)).catch(() => {});
}
