import 'server-only';
// Emails applicants about a decision on their application, using the hub's name and replying to
// the hub's contact address. Runs after the status change is committed; a mail failure never
// undoes a decision, it is only logged.
//
// Acceptance and cohort admission emails carry a welcome link (welcomeLinks in lib/auth): one
// click opens the learner's account, so nobody accepted has to work out how to sign in.
import { withUser } from '@talentral/db';
import { isNotifiedStatus } from '@talentral/domain';
import { welcomeLinks } from './auth';
import { BRAND_COLUMNS, brandOf, type BrandColumns } from './brand';
import { formatDate } from './format';
import { enrolledMail, sendMailBatch, statusChangeMail } from './mail';

export async function notifyStatusChange(userId: string, hubId: string, applicationIds: string[], status: string): Promise<number> {
  if (!isNotifiedStatus(status) || !applicationIds.length) return 0;
  const rows = await withUser(userId, (tx) => tx<({ email: string; full_name: string; reference: string; programme: string; hub_name: string; contact_email: string | null } & BrandColumns)[]>`
    select a.email, a.full_name, a.reference, p.title as programme, t.name as hub_name, t.contact_email, ${tx.unsafe(BRAND_COLUMNS)}
    from public.applications a join public.programmes p on p.id = a.programme_id join public.tenants t on t.id = a.tenant_id
    where a.tenant_id = ${hubId} and a.id = any (${applicationIds}::uuid[]) and a.status = ${status}`);
  let sent = 0;
  try {
    const links = status === 'accepted' ? await welcomeLinks(rows.map((r) => ({ email: r.email, name: r.full_name })), '/learn') : null;
    sent = await sendMailBatch(rows.map((r) => statusChangeMail(status, {
      to: r.email, name: r.full_name, hubName: r.hub_name, programme: r.programme, reference: r.reference, replyTo: r.email_reply_to ?? r.contact_email, brand: brandOf(r.hub_name, r),
      link: links?.get(r.email.toLowerCase()),
    })));
  } catch (e) {
    console.error('status emails failed', e);
  }
  await withUser(userId, (tx) => tx`select app.audit(${hubId}, 'applications.notified', 'tenant', ${hubId}, ${tx.json({ status, emailed: sent, of: rows.length })})`);
  return sent;
}

// Tells learners a hub has added them to a cohort, with a link straight into their learning.
export async function notifyEnrolled(userId: string, hubId: string, cohortId: string, enrolmentIds: string[]): Promise<number> {
  if (!enrolmentIds.length) return 0;
  const rows = await withUser(userId, (tx) => tx<({ email: string; full_name: string; cohort: string; programme: string; starts_on: string | null; hub_name: string } & BrandColumns)[]>`
    select a.email, a.full_name, c.name as cohort, p.title as programme, c.starts_on::text as starts_on, t.name as hub_name, ${tx.unsafe(BRAND_COLUMNS)}
    from public.enrolments e join public.applications a on a.id = e.application_id join public.cohorts c on c.id = e.cohort_id
    join public.programmes p on p.id = c.programme_id join public.tenants t on t.id = e.tenant_id
    where e.tenant_id = ${hubId} and e.cohort_id = ${cohortId} and e.id = any (${enrolmentIds}::uuid[]) and e.status <> 'dropped'`);
  let sent = 0;
  try {
    const links = await welcomeLinks(rows.map((r) => ({ email: r.email, name: r.full_name })), '/learn');
    sent = await sendMailBatch(rows.map((r) => {
      const brand = brandOf(r.hub_name, r);
      return enrolledMail({
        to: r.email, name: r.full_name, hub: brand, cohort: r.cohort, programme: r.programme,
        startsOn: r.starts_on ? formatDate(r.starts_on) : null, link: links.get(r.email.toLowerCase())!, replyTo: brand.replyTo,
      });
    }));
  } catch (e) {
    console.error('enrolment emails failed', e);
  }
  await withUser(userId, (tx) => tx`select app.audit(${hubId}, 'cohort.learners_emailed', 'cohort', ${cohortId}, ${tx.json({ emailed: sent, of: rows.length })})`);
  return sent;
}
