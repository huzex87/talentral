'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { withUser } from '@talentral/db';
import { MARKS, certificateSerial, newCheckinCode, referencePrefix, validateRule, type Mark, type PartnerSnapshot } from '@talentral/domain';
import { hubAccess, requireHubRole } from '@/lib/auth';
import { loadCohortLearners, type CohortInfo } from '@/lib/cohort-data';
import { env } from '@/lib/env';
import { fromLocalInput } from '@/lib/format';
import { tenantBrand } from '@/lib/brand';
import { announcementMail, certificateMail, sendMailBatch } from '@/lib/mail';
import { notifyEnrolled } from '@/lib/notify';
import { sendTexts, textingEnabled } from '@/lib/texts';

export interface FormState { ok?: boolean; message?: string; errors?: Record<string, string> }
const UUID = /^[0-9a-f-]{36}$/;

const cohortSchema = z.object({
  programme: z.string().regex(UUID, 'Choose a programme.'),
  name: z.string().trim().min(2, 'Name the cohort, for example "Cohort 1".').max(120),
  starts_on: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  ends_on: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  min_attendance: z.coerce.number().int().min(0, 'Between 0 and 100.').max(100, 'Between 0 and 100.'),
});

export async function createCohort(slug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const parsed = cohortSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors };
  }
  const d = parsed.data;
  if (d.starts_on && d.ends_on && d.ends_on < d.starts_on) return { errors: { ends_on: 'The end date must be after the start date.' } };
  const [row] = await withUser(user.id, async (tx) => {
    const r = await tx<{ id: string }[]>`
      insert into public.cohorts (tenant_id, programme_id, name, starts_on, ends_on, min_attendance)
      values (${hub.id}, ${d.programme}, ${d.name}, ${d.starts_on || null}, ${d.ends_on || null}, ${d.min_attendance}) returning id`;
    await tx`select app.audit(${hub.id}, 'cohort.created', 'cohort', ${r[0]!.id})`;
    return r;
  });
  redirect(`/dashboard/${slug}/cohorts/${row!.id}`);
}

// Enrols every accepted applicant of the cohort's programme who is not yet in a cohort and, unless
// the hub unticks it, emails each one a link that opens their learning.
export async function admitAccepted(slug: string, cohortId: string, notify = true): Promise<FormState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const ids = await withUser(user.id, async (tx) => {
    const rows = await tx<{ id: string }[]>`
      insert into public.enrolments (tenant_id, cohort_id, application_id)
      select ${hub.id}, c.id, a.id from public.cohorts c
      join public.applications a on a.programme_id = c.programme_id and a.status = 'accepted'
      where c.id = ${cohortId} and c.tenant_id = ${hub.id}
        and not exists (select 1 from public.enrolments e where e.application_id = a.id)
      returning id`;
    if (rows.length) await tx`select app.audit(${hub.id}, 'cohort.admitted', 'cohort', ${cohortId}, ${tx.json({ learners: rows.length })})`;
    return rows.map((r) => r.id);
  });
  const n = ids.length;
  const emailed = notify && n ? await notifyEnrolled(user.id, hub.id, cohortId, ids) : 0;
  revalidatePath(`/dashboard/${slug}/cohorts`, 'layout');
  if (!n) return { ok: false, message: 'Everyone accepted is already in a cohort.' };
  const added = `${n} ${n === 1 ? 'learner' : 'learners'} added to the cohort.`;
  if (!notify) return { ok: true, message: added };
  return { ok: true, message: emailed === n ? `${added} We emailed ${n === 1 ? 'them' : 'each of them'} a link to start learning.` : `${added} We sent ${emailed} of ${n} emails. Check the other email addresses on their applications.` };
}

export async function setEnrolmentStatus(slug: string, cohortId: string, ids: string[], status: 'active' | 'completed' | 'dropped', reason = ''): Promise<FormState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  if (!['active', 'completed', 'dropped'].includes(status)) return { message: 'Unknown status.' };
  const clean = ids.filter((i) => UUID.test(i)).slice(0, 2000);
  const n = await withUser(user.id, async (tx) => {
    const rows = await tx<{ id: string }[]>`
      update public.enrolments set status = ${status},
        completed_at = ${status === 'completed' ? tx`now()` : null},
        dropped_reason = ${status === 'dropped' ? reason.trim().slice(0, 300) || null : null}
      where tenant_id = ${hub.id} and cohort_id = ${cohortId} and id = any (${clean}::uuid[]) returning id`;
    await tx`select app.audit(${hub.id}, 'cohort.enrolment_status', 'cohort', ${cohortId}, ${tx.json({ status, learners: rows.length })})`;
    return rows.length;
  });
  revalidatePath(`/dashboard/${slug}/cohorts/${cohortId}`);
  const verb = status === 'completed' ? 'marked as completed' : status === 'dropped' ? 'marked as dropped out' : 'set back to active';
  return { ok: true, message: `${n} ${n === 1 ? 'learner' : 'learners'} ${verb}.` };
}

export async function setCohortStatus(slug: string, cohortId: string, status: 'planned' | 'running' | 'completed') {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  if (!['planned', 'running', 'completed'].includes(status)) return;
  await withUser(user.id, (tx) => tx`update public.cohorts set status = ${status} where id = ${cohortId} and tenant_id = ${hub.id}`);
  revalidatePath(`/dashboard/${slug}/cohorts`, 'layout');
}

const sessionSchema = z.object({
  title: z.string().trim().min(2, 'Give the session a title.').max(160),
  starts_at: z.string().min(1, 'Choose when it starts.'),
  duration: z.coerce.number().int().min(15).max(600),
  mode: z.enum(['in_person', 'online', 'hybrid']),
  location: z.string().trim().max(300),
  facilitator: z.string().trim().max(120),
  meeting_url: z.string().trim().max(500).refine((v) => v === '' || /^https:\/\/\S+\.\S+/.test(v), 'Paste the full meeting link, starting with https://').optional(),
});

export async function createSession(slug: string, cohortId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const parsed = sessionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors };
  }
  const d = parsed.data;
  const start = fromLocalInput(d.starts_at);
  if (!start) return { errors: { starts_at: 'Choose a valid date and time.' } };
  const end = new Date(start.getTime() + d.duration * 60_000);
  await withUser(user.id, (tx) => tx`
    insert into public.class_sessions (tenant_id, cohort_id, title, starts_at, ends_at, mode, location, facilitator, checkin_code, meeting_url)
    select ${hub.id}, c.id, ${d.title}, ${start}, ${end}, ${d.mode}, ${d.location || null}, ${d.facilitator || null}, ${newCheckinCode()}, ${d.meeting_url || null}
    from public.cohorts c where c.id = ${cohortId} and c.tenant_id = ${hub.id}`);
  revalidatePath(`/dashboard/${slug}/cohorts/${cohortId}`);
  return { ok: true, message: `“${d.title}” added to the timetable.` };
}

export async function setCheckin(slug: string, sessionId: string, open: boolean, newCode = false) {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  await withUser(user.id, (tx) => tx`
    update public.class_sessions set checkin_open = ${open} ${newCode ? tx`, checkin_code = ${newCheckinCode()}` : tx``}
    where id = ${sessionId} and tenant_id = ${hub.id}`);
  revalidatePath(`/dashboard/${slug}/cohorts`, 'layout');
}

// One register mark from a team member; overrides a learner's own check-in.
export async function markAttendance(slug: string, sessionId: string, enrolmentId: string, mark: Mark): Promise<boolean> {
  const { user, hub } = await hubAccess(slug);
  if (!MARKS.includes(mark) || !UUID.test(sessionId) || !UUID.test(enrolmentId)) return false;
  await withUser(user.id, (tx) => tx`
    insert into public.attendance (tenant_id, session_id, enrolment_id, status, method, marked_by)
    values (${hub.id}, ${sessionId}, ${enrolmentId}, ${mark}, 'register', ${user.id})
    on conflict (session_id, enrolment_id)
    do update set status = excluded.status, method = 'register', marked_by = excluded.marked_by, marked_at = now()`);
  return true;
}

// Marks everyone without a mark yet, typically "absent" once the class is over.
export async function markRemaining(slug: string, sessionId: string, mark: Mark): Promise<number> {
  const { user, hub } = await hubAccess(slug);
  if (!MARKS.includes(mark)) return 0;
  const rows = await withUser(user.id, (tx) => tx<{ id: string }[]>`
    insert into public.attendance (tenant_id, session_id, enrolment_id, status, method, marked_by)
    select ${hub.id}, s.id, e.id, ${mark}, 'register', ${user.id}
    from public.class_sessions s join public.enrolments e on e.cohort_id = s.cohort_id and e.status <> 'dropped'
    where s.id = ${sessionId} and s.tenant_id = ${hub.id}
      and not exists (select 1 from public.attendance a where a.session_id = s.id and a.enrolment_id = e.id)
    returning id`);
  revalidatePath(`/dashboard/${slug}/cohorts`, 'layout');
  return rows.length;
}

// ---------------------------------------------------------------- assessments

const assessmentSchema = z.object({
  title: z.string().trim().min(2, 'Give the assessment a title.').max(160),
  kind: z.enum(['assignment', 'quiz', 'project', 'practical']),
  max_score: z.coerce.number().int().min(1, 'At least 1.').max(1000),
  weight: z.coerce.number().int().min(1).max(10),
  due_on: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  pass_mark: z.coerce.number().int().min(0, 'Between 0 and 100.').max(100, 'Between 0 and 100.'),
});

export async function createAssessment(slug: string, cohortId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const parsed = assessmentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors };
  }
  const d = parsed.data;
  const skillIds = [...new Set(form.getAll('skills').map(String).filter((v) => UUID.test(v)))].slice(0, 12);
  await withUser(user.id, async (tx) => {
    const [a] = await tx<{ id: string }[]>`insert into public.assessments (tenant_id, cohort_id, title, kind, max_score, weight, due_on)
      select ${hub.id}, c.id, ${d.title}, ${d.kind}, ${d.max_score}, ${d.weight}, ${d.due_on || null} from public.cohorts c where c.id = ${cohortId} and c.tenant_id = ${hub.id}
      returning id`;
    for (const skill of a ? skillIds : []) {
      await tx`insert into public.assessment_skills (assessment_id, skill_id, tenant_id) values (${a!.id}, ${skill}, ${hub.id}) on conflict do nothing`;
    }
    await tx`update public.cohorts set pass_mark = ${d.pass_mark} where id = ${cohortId} and tenant_id = ${hub.id}`;
  });
  revalidatePath(`/dashboard/${slug}/cohorts/${cohortId}`);
  return { ok: true, message: `“${d.title}” added. Open it to enter scores.` };
}

// Saves (or clears, when score is null) one learner's result; any team member can grade.
export async function saveResult(slug: string, assessmentId: string, enrolmentId: string, score: number | null, feedback: string): Promise<{ ok: boolean; message?: string }> {
  const { user, hub } = await hubAccess(slug);
  if (!UUID.test(assessmentId) || !UUID.test(enrolmentId)) return { ok: false, message: 'Not found.' };
  return withUser(user.id, async (tx) => {
    const [a] = await tx<{ max_score: number }[]>`select max_score from public.assessments where id = ${assessmentId} and tenant_id = ${hub.id}`;
    if (!a) return { ok: false, message: 'Assessment not found.' };
    if (score === null) {
      await tx`delete from public.assessment_results where assessment_id = ${assessmentId} and enrolment_id = ${enrolmentId} and tenant_id = ${hub.id}`;
      return { ok: true };
    }
    if (!Number.isFinite(score) || score < 0 || score > a.max_score) return { ok: false, message: `Enter a score from 0 to ${a.max_score}.` };
    await tx`
      insert into public.assessment_results (tenant_id, assessment_id, enrolment_id, score, feedback, graded_by)
      values (${hub.id}, ${assessmentId}, ${enrolmentId}, ${score}, ${feedback.trim().slice(0, 1000) || null}, ${user.id})
      on conflict (assessment_id, enrolment_id)
      do update set score = excluded.score, feedback = excluded.feedback, graded_by = excluded.graded_by, graded_at = now()`;
    return { ok: true };
  });
}

// ---------------------------------------------------------------- certificates

// Issues a certificate to every learner marked as completed who does not have one yet, with a
// snapshot of what it certifies, and emails each learner the link to view and verify it.
export async function issueCertificates(slug: string, cohortId: string): Promise<FormState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const issued = await withUser(user.id, async (tx) => {
    const [c] = await tx<(CohortInfo & { starts_on: string | null })[]>`
      select c.id, c.name, c.min_attendance, c.pass_mark, c.starts_on::text, p.title as programme, p.id as programme_id
      from public.cohorts c join public.programmes p on p.id = c.programme_id where c.id = ${cohortId} and c.tenant_id = ${hub.id}`;
    if (!c) return [];
    const { learners } = await loadCohortLearners(tx, hub.id, c);
    // The programme's partners at the moment of issue, frozen onto each certificate.
    const partners = await tx<PartnerSnapshot[]>`select name, role, logo_path from public.programme_partners
      where programme_id = ${c.programme_id} order by position, created_at`;
    const out: { email: string; name: string; serial: string }[] = [];
    for (const l of learners.filter((x) => x.status === 'completed' && !x.certificate)) {
      const completed = l.completed_at ? new Date(l.completed_at) : new Date();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const serial = certificateSerial(referencePrefix(hub.slug), completed);
        try {
          await tx.savepoint((sp) => sp`
            insert into public.certificates (tenant_id, enrolment_id, serial, learner_name, programme_title, cohort_name, hub_name, hub_slug, track, attendance, score, completed_on, partners, issued_by)
            values (${hub.id}, ${l.id}, ${serial}, ${l.full_name}, ${c.programme}, ${c.name}, ${hub.name}, ${hub.slug}, ${l.track}, ${l.rate}, ${l.score.percent},
                    ${completed.toISOString().slice(0, 10)}, ${sp.json(partners.map((x) => ({ name: x.name, role: x.role, logo_path: x.logo_path })))}, ${user.id})`);
          out.push({ email: l.email, name: l.full_name, serial });
          break;
        } catch (e) {
          if ((e as { constraint_name?: string }).constraint_name !== 'certificates_serial_key') throw e;
        }
      }
    }
    if (out.length) await tx`select app.audit(${hub.id}, 'certificates.issued', 'cohort', ${cohortId}, ${tx.json({ issued: out.length })})`;
    return out;
  });
  if (issued.length) {
    await sendMailBatch(issued.map((i) => certificateMail(i.email, i.name, tenantBrand(hub), `${env.appUrl}/verify/${i.serial}`, i.serial, null, `${env.appUrl}/passport`)))
      .catch((e) => console.error('certificate emails failed', e));
  }
  revalidatePath(`/dashboard/${slug}/cohorts/${cohortId}`);
  return { ok: issued.length > 0, message: issued.length ? `${issued.length} ${issued.length === 1 ? 'certificate' : 'certificates'} issued and emailed.` : 'Everyone who completed already has a certificate.' };
}

export async function revokeCertificate(slug: string, serial: string, reason: string): Promise<FormState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const why = reason.trim().slice(0, 300);
  if (why.length < 3) return { message: 'Give a reason; it is shown on the verification page.' };
  const rows = await withUser(user.id, async (tx) => {
    const r = await tx<{ id: string }[]>`update public.certificates set revoked_at = now(), revoked_reason = ${why}
      where serial = ${serial} and tenant_id = ${hub.id} and revoked_at is null returning id`;
    if (r.length) await tx`select app.audit(${hub.id}, 'certificate.revoked', 'certificate', ${r[0]!.id}, ${tx.json({ serial, reason: why })})`;
    return r;
  });
  revalidatePath(`/verify/${serial}`);
  return { ok: rows.length > 0, message: rows.length ? 'Certificate revoked.' : 'This certificate is already revoked.' };
}

// Start and end dates can be set or changed later; modules that open "N days after the start"
// count from the start date.
export async function saveCohortDates(slug: string, cohortId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const starts = String(form.get('starts_on') ?? '');
  const ends = String(form.get('ends_on') ?? '');
  const date = /^(\d{4}-\d{2}-\d{2})?$/;
  if (!date.test(starts) || !date.test(ends)) return { errors: { starts_on: 'Enter valid dates.' } };
  if (starts && ends && ends < starts) return { errors: { ends_on: 'The end date must be after the start date.' } };
  await withUser(user.id, (tx) => tx`update public.cohorts set starts_on = ${starts || null}, ends_on = ${ends || null} where id = ${cohortId} and tenant_id = ${hub.id}`);
  revalidatePath(`/dashboard/${slug}/cohorts/${cohortId}`);
  return { ok: true, message: 'Dates saved.' };
}

// Turns automated nudges on or off for a cohort and sets their timing (E12.2).
export async function saveNudgeRule(slug: string, cohortId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  if (!UUID.test(cohortId)) return { message: 'Something went wrong. Reload the page.' };
  const on = form.get('enabled') === 'on';
  const rule = { afterDays: Number(form.get('after_days')), escalateDays: Number(form.get('escalate_days')) };
  const problem = on ? validateRule(rule) : null;
  if (problem) return { message: problem };
  const changed = await withUser(user.id, async (tx) => {
    const rows = await tx`update public.cohorts set nudge_after_days = ${on ? rule.afterDays : null}${on ? tx`, nudge_escalate_days = ${rule.escalateDays}` : tx``}
                          where id = ${cohortId} and tenant_id = ${hub.id} returning id`;
    if (rows.length) await tx`select app.audit(${hub.id}, 'cohort.nudges_updated', 'cohort', ${cohortId}, ${tx.json(on ? { on, after_days: rule.afterDays, team_after: rule.escalateDays } : { on })})`;
    return rows.length > 0;
  });
  if (!changed) return { message: 'That could not be saved. Reload the page and try again.' };
  revalidatePath(`/dashboard/${slug}/cohorts/${cohortId}`);
  return { ok: true, message: on ? `Nudges are on: after ${rule.afterDays} days without activity, then the team ${rule.escalateDays} ${rule.escalateDays === 1 ? 'day' : 'days'} later.` : 'Nudges are off for this cohort.' };
}

// The executive summary at the top of the cohort's funder report.
export async function saveFunderSummary(slug: string, cohortId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  if (!UUID.test(cohortId)) return { message: 'Something went wrong. Reload the page.' };
  const summary = String(form.get('summary') ?? '').trim();
  if (summary.length > 4000) return { message: 'Keep the summary under 4,000 characters.' };
  const changed = await withUser(user.id, async (tx) => {
    const rows = await tx`update public.cohorts set funder_summary = ${summary || null} where id = ${cohortId} and tenant_id = ${hub.id} returning id`;
    if (rows.length) await tx`select app.audit(${hub.id}, 'cohort.funder_summary_updated', 'cohort', ${cohortId}, ${tx.json({ characters: summary.length })})`;
    return rows.length > 0;
  });
  if (!changed) return { message: 'That could not be saved. Reload the page and try again.' };
  revalidatePath(`/dashboard/${slug}/cohorts/${cohortId}/funder`);
  return { ok: true, message: summary ? 'Summary saved. It now opens the report.' : 'Summary removed.' };
}

// ---------------------------------------------------------------- live sessions

const https = (v: string) => v === '' || /^https:\/\/\S+\.\S+/.test(v);

export async function saveSessionLinks(slug: string, sessionId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const meeting = String(form.get('meeting_url') ?? '').trim();
  const recording = String(form.get('recording_url') ?? '').trim();
  const errors: Record<string, string> = {};
  if (!https(meeting)) errors.meeting_url = 'Paste the full meeting link, starting with https://';
  if (!https(recording)) errors.recording_url = 'Paste the full recording link, starting with https://';
  if (Object.keys(errors).length) return { errors };
  await withUser(user.id, (tx) => tx`update public.class_sessions set meeting_url = ${meeting || null}, recording_url = ${recording || null}
    where id = ${sessionId} and tenant_id = ${hub.id}`);
  revalidatePath(`/dashboard/${slug}/cohorts`, 'layout');
  return { ok: true, message: 'Links saved.' };
}

// Confirms the register: learners without a mark are recorded absent and the list is final.
export async function confirmRegister(slug: string, sessionId: string): Promise<FormState> {
  const { user } = await hubAccess(slug);
  try {
    const [r] = await withUser(user.id, (tx) => tx<{ n: number }[]>`select app.confirm_attendance(${sessionId}) as n`);
    revalidatePath(`/dashboard/${slug}/cohorts`, 'layout');
    return { ok: true, message: r!.n ? `Register confirmed. ${r!.n} ${r!.n === 1 ? 'learner' : 'learners'} without a mark recorded absent.` : 'Register confirmed.' };
  } catch (e) {
    if ((e as { code?: string }).code === 'P0001') return { message: 'You can confirm the register once the session has started.' };
    throw e;
  }
}

// The current QR image for the room screen. The code inside changes every minute.
export async function sessionQr(slug: string, sessionId: string): Promise<{ svg: string; minute: number } | null> {
  const { user } = await hubAccess(slug);
  const [q] = await withUser(user.id, (tx) => tx<{ token: string; minute: string }[]>`select * from app.session_qr(${sessionId})`);
  if (!q) return null;
  const QRCode = (await import('qrcode')).default;
  const url = `${env.appUrl}/learn/checkin/${sessionId}?t=${q.token}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#101733', light: '#FFFFFF' } });
  return { svg, minute: Number(q.minute) };
}

// An announcement to everyone in a cohort: always on My learning, and by email and/or text if
// chosen (WhatsApp for learners who chose it, SMS for the rest).
export async function postAnnouncement(slug: string, cohortId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const { user, hub } = await requireHubRole(slug, ['owner', 'admin']);
  const title = String(form.get('title') ?? '').trim();
  const body = String(form.get('body') ?? '').trim();
  const channels = form.getAll('channels').map(String).filter((c) => c === 'email' || c === 'sms');
  const errors: Record<string, string> = {};
  if (title.length < 2 || title.length > 160) errors.title = 'Give the announcement a short title.';
  if (!body || body.length > 5000) errors.body = 'Write the announcement (up to 5,000 characters).';
  if (channels.includes('sms') && !textingEnabled()) errors.channels = 'Text messages are not set up yet. Send by email, or post on My learning only.';
  if (Object.keys(errors).length) return { errors };
  const { id, learners, optedIn } = await withUser(user.id, async (tx) => {
    const [a] = await tx<{ id: string }[]>`insert into public.announcements (tenant_id, cohort_id, author_id, title, body, channels)
      values (${hub.id}, ${cohortId}, ${user.id}, ${title}, ${body}, ${channels}) returning id`;
    const learners = await tx<{ email: string; phone: string; full_name: string; language: 'en' | 'ha' }[]>`
      select a.email::text, a.phone, a.full_name, coalesce(u.language, 'en') as language
      from public.enrolments e join public.applications a on a.id = e.application_id left join public.users u on u.email = a.email
      where e.cohort_id = ${cohortId} and e.tenant_id = ${hub.id} and e.status <> 'dropped'`;
    const optedIn = channels.includes('sms') && learners.length
      ? new Set((await tx<{ phone: string }[]>`select * from app.whatsapp_audience(${hub.id}, ${learners.map((l) => l.phone)}::text[]) as phone`).map((r) => r.phone))
      : new Set<string>();
    return { id: a!.id, learners, optedIn };
  });
  const url = `${env.appUrl}/learn`;
  const emailed = channels.includes('email')
    ? await sendMailBatch(learners.map((l) => announcementMail(l.email, l.full_name, tenantBrand(hub), title, body, url))).catch(() => 0) : 0;
  const sent = channels.includes('sms')
    ? await sendTexts(learners.map((l) => ({ phone: l.phone, language: l.language, hub: hub.name, text: `${hub.name}: ${title}. ${body}` })), optedIn)
    : { sms: 0, whatsapp: 0 };
  const texted = sent.sms + sent.whatsapp;
  await withUser(user.id, (tx) => tx`update public.announcements set recipients = ${learners.length}, emailed = ${emailed}, texted = ${texted} where id = ${id}`);
  revalidatePath(`/dashboard/${slug}/cohorts/${cohortId}`);
  const how = [emailed && `${emailed} emailed`, sent.whatsapp && `${sent.whatsapp} on WhatsApp`, sent.sms && `${sent.sms} by SMS`].filter(Boolean);
  return { ok: true, message: `Posted to ${learners.length} ${learners.length === 1 ? 'learner' : 'learners'}${how.length ? `, ${how.join(', ')}` : ''}.` };
}
