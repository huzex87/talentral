import 'server-only';
// The public jobs board (MVP-2 month 7) and, for a signed-in learner, the evidence behind each of
// their skills, so every job shows which required skills they have proven, claimed or lack.
import type { Tx } from '@talentral/db';
import type { SkillSources } from '@talentral/domain';

export interface BoardJob {
  id: string; title: string; description: string | null; requirements: string | null; skills: string[]; work_mode: 'remote' | 'hybrid' | 'on_site';
  job_type: 'full_time' | 'part_time' | 'contract' | 'internship' | 'freelance'; state: string | null; pay_min: number | null; pay_max: number | null;
  openings: number; closes_on: string | null; published_at: Date; employer_id: string; employer_name: string; employer_sector: string | null;
  employer_website: string | null; employer_state: string | null; employer_size: string | null;
}

export async function boardJobs(tx: Tx): Promise<BoardJob[]> {
  return tx<BoardJob[]>`select *, closes_on::text as closes_on from app.job_board()`;
}

// Self-declared skills (Passport and portfolio), skills shown in graded work (and portfolio items
// linked to graded work), and skills on items a talent officer verified.
export async function mySkillSources(tx: Tx, userId: string): Promise<SkillSources & { passport: boolean; employerSearch: boolean }> {
  const [p] = await tx<{ skills: string[]; employer_search: boolean }[]>`select skills, employer_search from public.passports where user_id = ${userId}`;
  const evidenced = (await tx<{ skill: string }[]>`select skill from app.evidenced_skills(${userId})`).map((r) => r.skill);
  const items = await tx<{ skills: string[]; submission_id: string | null; verified_at: Date | null }[]>`
    select skills, submission_id, verified_at from public.portfolio_items where user_id = ${userId}`;
  return {
    self: [...(p?.skills ?? []), ...items.filter((i) => !i.submission_id && !i.verified_at).flatMap((i) => i.skills)],
    evidenced: [...evidenced, ...items.filter((i) => i.submission_id).flatMap((i) => i.skills)],
    verified: items.filter((i) => i.verified_at).flatMap((i) => i.skills),
    passport: Boolean(p),
    employerSearch: Boolean(p?.employer_search),
  };
}
