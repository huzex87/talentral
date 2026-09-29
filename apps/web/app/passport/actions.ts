'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { withUser } from '@talentral/db';
import { AVAILABILITY, JOB_TYPES, LANGUAGES, NIGERIAN_STATES, WORK_MODES, cleanSkills, passportGaps } from '@talentral/domain';
import { requireUser } from '@/lib/auth';
import { translator } from '@/lib/i18n';

export interface PassportState { ok?: boolean; message?: string; errors?: Record<string, string> }

const url = z.string().trim().max(300).refine((v) => /^https?:\/\/\S+\.\S+/.test(v), 'Enter a full web address starting with https://');
const schema = z.object({
  headline: z.string().trim().max(120, 'Keep the headline under 120 characters.'),
  bio: z.string().trim().max(1500, 'Keep this under 1,500 characters.'),
  state: z.string().refine((v) => v === '' || (NIGERIAN_STATES as readonly string[]).includes(v), 'Choose a state.'),
  city: z.string().trim().max(80),
  availability: z.enum(Object.keys(AVAILABILITY) as [string, ...string[]]),
  languages: z.array(z.enum(LANGUAGES)).max(10),
  work_modes: z.array(z.enum(Object.keys(WORK_MODES) as [string, ...string[]])),
  job_types: z.array(z.enum(Object.keys(JOB_TYPES) as [string, ...string[]])),
  skills: z.array(z.string()).max(60),
  links: z.array(z.object({ label: z.string().trim().min(1, 'Name each link.').max(40), url })).max(6, 'Add up to 6 links.'),
  show_scores: z.boolean(),
});

export async function savePassport(_prev: PassportState, form: FormData): Promise<PassportState> {
  const user = await requireUser();
  const t = translator(user.language);
  const labels = form.getAll('link_label').map(String);
  const urls = form.getAll('link_url').map(String);
  const parsed = schema.safeParse({
    headline: String(form.get('headline') ?? ''), bio: String(form.get('bio') ?? ''), state: String(form.get('state') ?? ''),
    city: String(form.get('city') ?? ''), availability: String(form.get('availability') ?? 'immediately'),
    languages: form.getAll('languages').map(String), work_modes: form.getAll('work_modes').map(String), job_types: form.getAll('job_types').map(String),
    skills: String(form.get('skills') ?? '').split(/[,\n]/),
    links: labels.map((label, i) => ({ label, url: urls[i] ?? '' })).filter((l) => l.label.trim() || l.url.trim()),
    show_scores: form.get('show_scores') === 'on',
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[i.path[0] === 'links' ? 'links' : String(i.path[0])] ??= i.message;
    return { errors, message: t('Please check the highlighted fields.', 'Da fatan ka duba wuraren da aka yi wa alama.') };
  }
  const d = { ...parsed.data, skills: cleanSkills(parsed.data.skills) };
  const gaps = passportGaps(d, user.language);
  await withUser(user.id, async (tx) => {
    await tx`
      insert into public.passports (user_id, headline, bio, state, city, languages, skills, availability, work_modes, job_types, links, show_scores)
      values (${user.id}, ${d.headline || null}, ${d.bio || null}, ${d.state || null}, ${d.city || null}, ${d.languages}, ${d.skills},
              ${d.availability}, ${d.work_modes}, ${d.job_types}, ${tx.json(d.links)}, ${d.show_scores})
      on conflict (user_id) do update set headline = excluded.headline, bio = excluded.bio, state = excluded.state, city = excluded.city,
        languages = excluded.languages, skills = excluded.skills, availability = excluded.availability, work_modes = excluded.work_modes,
        job_types = excluded.job_types, links = excluded.links, show_scores = excluded.show_scores`;
    // An incomplete Passport cannot stay in search.
    if (gaps.length) await tx`update public.passports set discoverable = false, employer_search = false where user_id = ${user.id} and (discoverable or employer_search)`;
  });
  revalidatePath('/passport');
  return {
    ok: true,
    message: gaps.length ? t('Saved. Complete the checklist to become visible to talent officers.', 'An ajiye. Kammala jerin abubuwan domin jami’an Talentral su gan ka.')
      : t('Passport saved.', 'An ajiye Fasfo.'),
  };
}

const CONSENTS = ['discoverable', 'employer_search', 'employer_sharing', 'research'] as const;
export type ConsentKind = (typeof CONSENTS)[number];

export async function setConsent(kind: ConsentKind, on: boolean): Promise<PassportState> {
  const user = await requireUser();
  const t = translator(user.language);
  if (!CONSENTS.includes(kind)) return { message: 'Unknown consent.' };
  return withUser(user.id, async (tx) => {
    const [p] = await tx<{ headline: string | null; state: string | null; skills: string[]; work_modes: string[] }[]>`
      select headline, state, skills, work_modes from public.passports where user_id = ${user.id}`;
    if (on && (kind === 'discoverable' || kind === 'employer_search')) {
      const gaps = passportGaps(p ?? { headline: null, state: null, skills: [], work_modes: [] }, user.language);
      if (gaps.length) return { message: `${t('Complete your Passport first:', 'Kammala Fasfonka tukuna:')} ${gaps[0]}` };
    }
    if (!p) await tx`insert into public.passports (user_id) values (${user.id})`;
    await tx`update public.passports set ${tx({ [kind]: on })} where user_id = ${user.id}`;
    revalidatePath('/passport');
    return { ok: true };
  });
}

export async function respondToOpportunity(candidateId: string, interest: 'confirmed' | 'declined'): Promise<PassportState> {
  const user = await requireUser();
  const [r] = await withUser(user.id, (tx) => tx<{ ok: boolean }[]>`select app.respond_to_opportunity(${candidateId}, ${interest}) as ok`);
  revalidatePath('/passport');
  return r?.ok ? { ok: true } : { message: translator(user.language)('This opportunity is no longer open.', 'Wannan damar ba ta buɗe kuma.') };
}
