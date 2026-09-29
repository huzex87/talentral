'use server';
import { withUser } from '@talentral/db';
import { hubAccess } from '@/lib/auth';
import { env } from '@/lib/env';
import { feedbackMail, sendMail } from '@/lib/mail';

export interface GradeState { ok?: boolean; message?: string }

// Any team member can grade. A grade goes into the cohort's gradebook (where it counts towards
// completion and proven skills); asking for another attempt does not.
export async function gradeSubmission(slug: string, submissionId: string, outcome: 'graded' | 'resubmit', _prev: GradeState, form: FormData): Promise<GradeState> {
  const { user, hub } = await hubAccess(slug);
  const raw = String(form.get('score') ?? '').trim();
  const feedback = String(form.get('feedback') ?? '').trim().slice(0, 4000);
  const score = raw === '' ? null : Number(raw);
  if (outcome === 'graded' && (score === null || !Number.isFinite(score) || score < 0 || score > 100)) return { message: 'Enter a score from 0 to 100.' };
  if (outcome === 'resubmit' && feedback.length < 5) return { message: 'Tell the learner what to change.' };
  const done = await withUser(user.id, async (tx) => {
    const [s] = await tx<{ lesson_id: string; enrolment_id: string; cohort_id: string; lesson: string; email: string; full_name: string }[]>`
      update public.submissions s set status = ${outcome}, score = ${outcome === 'graded' ? score : null}, feedback = ${feedback || null}, graded_by = ${user.id}, graded_at = now()
      from public.enrolments e, public.applications a, public.lessons l
      where s.id = ${submissionId} and s.tenant_id = ${hub.id} and e.id = s.enrolment_id and a.id = e.application_id and l.id = s.lesson_id and s.status = 'submitted'
      returning s.lesson_id, s.enrolment_id, e.cohort_id, l.title as lesson, a.email::text, a.full_name`;
    if (!s) return null;
    if (outcome === 'graded') {
      await tx`
        insert into public.assessment_results (tenant_id, assessment_id, enrolment_id, score, feedback, graded_by)
        select ${hub.id}, a.id, ${s.enrolment_id}, round(${score!}::numeric / 100 * a.max_score, 2), ${feedback || null}, ${user.id}
        from public.assessments a where a.cohort_id = ${s.cohort_id} and a.lesson_id = ${s.lesson_id}
        on conflict (assessment_id, enrolment_id) do update set score = excluded.score, feedback = excluded.feedback, graded_by = excluded.graded_by, graded_at = now()`;
    }
    await tx`select app.audit(${hub.id}, ${`submission.${outcome}`}, 'submission', ${submissionId}, ${tx.json({ score })})`;
    return s;
  });
  if (!done) return { message: 'This work has already been graded.' };
  await sendMail(feedbackMail(done.email, done.full_name, hub.name, done.lesson, outcome, score, `${env.appUrl}/learn/${done.cohort_id}/${done.lesson_id}`, hub.contact_email))
    .catch((e) => console.error('feedback email failed', e));
  // No page refresh here: the card stays with its confirmation, and the queue updates on the next visit.
  return { ok: true, message: outcome === 'graded' ? `Graded ${score}% and emailed to ${done.full_name.split(' ')[0]}.` : `Sent back to ${done.full_name.split(' ')[0]} with your feedback.` };
}
