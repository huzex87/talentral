import 'server-only';
// Emails applicants about a decision on their application, using the hub's name and replying to
// the hub's contact address. Runs after the status change is committed; a mail failure never
// undoes a decision, it is only logged.
import { withUser } from '@talentral/db';
import { isNotifiedStatus } from '@talentral/domain';
import { sendMailBatch, statusChangeMail } from './mail';

export async function notifyStatusChange(userId: string, hubId: string, applicationIds: string[], status: string): Promise<number> {
  if (!isNotifiedStatus(status) || !applicationIds.length) return 0;
  const rows = await withUser(userId, (tx) => tx<{ email: string; full_name: string; reference: string; programme: string; hub_name: string; contact_email: string | null }[]>`
    select a.email, a.full_name, a.reference, p.title as programme, t.name as hub_name, t.contact_email
    from public.applications a join public.programmes p on p.id = a.programme_id join public.tenants t on t.id = a.tenant_id
    where a.tenant_id = ${hubId} and a.id = any (${applicationIds}::uuid[]) and a.status = ${status}`);
  let sent = 0;
  try {
    sent = await sendMailBatch(rows.map((r) => statusChangeMail(status, {
      to: r.email, name: r.full_name, hubName: r.hub_name, programme: r.programme, reference: r.reference, replyTo: r.contact_email,
    })));
  } catch (e) {
    console.error('status emails failed', e);
  }
  await withUser(userId, (tx) => tx`select app.audit(${hubId}, 'applications.notified', 'tenant', ${hubId}, ${tx.json({ status, emailed: sent, of: rows.length })})`);
  return sent;
}
