'use server';
// Learners apply to jobs on the board with their Passport (MVP-2 month 8). The match is worked out
// here, on the server, from the same Passport employers see, and stored with the application so
// the employer sees why it ranks where it does.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { withUser } from '@talentral/db';
import { COVER_NOTE_MAX, matchTalent } from '@talentral/domain';
import { requireUser } from '@/lib/auth';
import { env } from '@/lib/env';
import { translator } from '@/lib/i18n';
import { boardJobs } from '@/lib/jobs-data';
import { newApplicantMail, sendMail } from '@/lib/mail';
import { myTalent } from '@/lib/talent-data';

export interface ApplyState { ok?: boolean; message?: string; errors?: Record<string, string> }

const UUID = /^[0-9a-f-]{36}$/;
const noteSchema = z.string().trim().max(COVER_NOTE_MAX);

export async function applyToJob(jobId: string, _prev: ApplyState, form: FormData): Promise<ApplyState> {
  const user = await requireUser();
  const t = translator(user.language);
  if (!UUID.test(jobId)) return { message: t('This job is no longer open.', 'Wannan aikin ba ya buɗe kuma.') };
  const note = noteSchema.safeParse(String(form.get('note') ?? ''));
  if (!note.success) return { errors: { note: t(`Keep your note under ${COVER_NOTE_MAX.toLocaleString('en-NG')} characters.`, `Rubutunka kada ya wuce haruffa ${COVER_NOTE_MAX}.`) } };

  const result = await withUser(user.id, async (tx) => {
    // Applying shares the Passport with this employer, so the learner turns sharing on here if needed.
    if (form.get('share') === 'on') await tx`update public.passports set employer_sharing = true where user_id = ${user.id} and not employer_sharing`;
    const job = (await boardJobs(tx)).find((j) => j.id === jobId);
    if (!job) return { error: 'closed' as const };
    const me = await myTalent(tx, user.id);
    if (!me) return { error: 'passport' as const };
    const m = matchTalent({ skills: job.skills, work_mode: job.work_mode, state: job.state }, me);
    try {
      const [row] = await tx<{ candidate_id: string; role_title: string; employer_name: string; notify: string[] }[]>`
        select * from app.apply_to_job(${jobId}, ${note.data}, ${Math.min(100, m.score)}, ${m.reasons}, ${m.concerns})`;
      return { row: row!, reasons: m.reasons };
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      return { error: /already applied/.test(msg) ? 'already' as const : /sharing/.test(msg) ? 'sharing' as const : /10 jobs a day/.test(msg) ? 'limit' as const
        : /Passport/.test(msg) ? 'passport' as const : 'closed' as const };
    }
  });

  if ('error' in result && result.error) {
    const messages: Record<'closed' | 'passport' | 'sharing' | 'already' | 'limit', ApplyState> = {
      closed: { message: t('This job is no longer open.', 'Wannan aikin ba ya buɗe kuma.') },
      passport: { message: t('Create your Passport first, so the employer can see your skills.', 'Ƙirƙiri Fasfonka tukuna, domin mai ɗaukar aiki ya ga ƙwarewarka.') },
      sharing: { errors: { share: t('Tick the box to share your Passport with employers you apply to.', 'Danna akwatin domin raba Fasfonka da masu ɗaukar aikin da ka nema.') } },
      already: { message: t('You have already applied to this job.', 'Ka riga ka nemi wannan aikin.') },
      limit: { message: t('You can apply to 10 jobs a day. Try again tomorrow.', 'Za ka iya neman ayyuka 10 a rana. Sake gwadawa gobe.') },
    };
    return messages[result.error];
  }
  if (!('row' in result) || !result.row) return { message: t('This job is no longer open.', 'Wannan aikin ba ya buɗe kuma.') };

  const { row } = result;
  const url = `${env.appUrl}/employer/jobs/${jobId}`;
  await Promise.all(row.notify.map((to) => sendMail(newApplicantMail(to, row.employer_name, row.role_title, user.full_name ?? 'A Talentral learner', (result.reasons ?? []).slice(0, 3), url))
    .catch((e) => console.error('applicant email failed', e))));
  revalidatePath('/jobs', 'layout');
  revalidatePath('/passport');
  return { ok: true, message: t(`Application sent to ${row.employer_name}.`, `An aika neman aikinka zuwa ${row.employer_name}.`) };
}

export async function withdrawApplication(candidateId: string): Promise<ApplyState> {
  const user = await requireUser();
  const t = translator(user.language);
  if (!UUID.test(candidateId)) return { message: t('Not found.', 'Ba a samu ba.') };
  const [r] = await withUser(user.id, (tx) => tx<{ ok: boolean }[]>`select app.withdraw_application(${candidateId}) as ok`);
  revalidatePath('/jobs', 'layout');
  revalidatePath('/passport');
  return r?.ok ? { ok: true, message: t('Application withdrawn. The employer no longer sees it.', 'An janye neman. Mai ɗaukar aikin ba zai ƙara ganinsa ba.') }
    : { message: t('This application can no longer be withdrawn.', 'Ba za a iya janye wannan neman ba yanzu.') };
}
