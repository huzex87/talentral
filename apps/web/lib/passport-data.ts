import 'server-only';
// Loads a Passport with the learning record behind it. Used by the learner's own page and the
// talent officer console; Row-Level Security decides whose Passport the caller may read.
import type { Tx } from '@talentral/db';
import { readinessLevel, type Readiness, type WorkAvailability } from '@talentral/domain';
import type { PortfolioView, TalentCardData, TalentEvidence } from '@/components/talent-card';

export interface PassportLink { label: string; url: string }
export interface Passport {
  user_id: string; headline: string | null; bio: string | null; state: string | null; city: string | null;
  languages: string[]; skills: string[]; availability: WorkAvailability; work_modes: string[]; job_types: string[];
  links: PassportLink[]; show_scores: boolean;
  discoverable: boolean; discoverable_at: Date | null; employer_sharing: boolean; employer_sharing_at: Date | null;
  research: boolean; research_at: Date | null; employer_search: boolean; employer_search_at: Date | null;
  verified_at: Date | null; updated_at: Date | null;
  available_from: string | null; relocate: boolean; target_roles: string[]; photo_path: string | null;
  job_alerts: boolean; job_alerts_at: Date | null;
}
export interface LearningRow {
  hub_name: string; hub_slug: string; programme_title: string; track: string | null; cohort_name: string;
  enrolment_status: 'active' | 'completed' | 'dropped'; enrolled_at: Date; completed_at: Date | null;
  certificate_serial: string | null; certificate_revoked: boolean; attendance: string | null; score: string | null;
}

export const EMPTY_PASSPORT: Omit<Passport, 'user_id'> = {
  headline: null, bio: null, state: null, city: null, languages: [], skills: [], availability: 'immediately', work_modes: [], job_types: [],
  links: [], show_scores: true, discoverable: false, discoverable_at: null, employer_sharing: false, employer_sharing_at: null,
  research: false, research_at: null, employer_search: false, employer_search_at: null, verified_at: null, updated_at: null,
  available_from: null, relocate: false, target_roles: [], photo_path: null, job_alerts: false, job_alerts_at: null,
};

export async function loadPassport(tx: Tx, userId: string) {
  const [row] = await tx<Passport[]>`select *, available_from::text as available_from from public.passports where user_id = ${userId}`;
  const portfolio = await tx<PortfolioView[]>`select * from app.portfolio_view(${userId})`;
  const learning = await tx<LearningRow[]>`select * from app.learning_record(${userId})`;
  const evidence = await tx<(TalentEvidence & { track: string; hub: string; graded_at: Date })[]>`select * from app.evidenced_skills(${userId})`;
  const certificates = learning.filter((l) => l.certificate_serial && !l.certificate_revoked);
  const readiness: Readiness = readinessLevel({
    enrolments: learning.filter((l) => l.enrolment_status !== 'dropped').length,
    certificates: certificates.length,
    verified: Boolean(row?.verified_at),
  });
  // Tracks and programmes behind a live certificate count as platform-evidenced skills.
  const evidenced = [...new Set(certificates.flatMap((c) => [c.track, c.programme_title]).filter((x): x is string => Boolean(x)))];
  return { passport: row ?? null, learning, readiness, evidenced, evidence, portfolio, exists: Boolean(row) };
}

// The shareable view of a Passport, as employers and talent officers see it.
export function toTalentCard(name: string, p: Omit<Passport, 'user_id'>, learning: LearningRow[], readiness: Readiness, evidence: TalentEvidence[] = [], portfolio: PortfolioView[] = [], userId?: string): TalentCardData {
  return {
    photoUrl: userId && p.photo_path ? `/media/passport/${userId}?v=${encodeURIComponent(p.photo_path.slice(-12))}` : null,
    evidence: evidence.map((e) => ({ ...e, percent: p.show_scores ? e.percent : null })),
    name, headline: p.headline, bio: p.bio, state: p.state, languages: p.languages, skills: p.skills, availability: p.availability,
    work_modes: p.work_modes, links: p.links, readiness,
    availableFrom: p.available_from, relocate: p.relocate, targetRoles: p.target_roles, portfolio,
    credentials: learning.filter((l) => l.certificate_serial && !l.certificate_revoked).map((l) => ({
      serial: l.certificate_serial!, programme: l.programme_title, hub: l.hub_name, track: l.track,
      completed_on: l.completed_at ?? l.enrolled_at,
      attendance: p.show_scores ? l.attendance : null, score: p.show_scores ? l.score : null,
    })),
  };
}

// How complete a Passport is, as the six things that make it findable and credible.
export function passportCompleteness(p: Pick<Passport, 'photo_path' | 'headline' | 'bio' | 'skills' | 'state' | 'links'>, portfolioItems: number) {
  const items = [
    { key: 'photo', done: Boolean(p.photo_path), en: 'Add a photo', ha: 'Saka hoto' },
    { key: 'headline', done: Boolean(p.headline?.trim()), en: 'Write a headline', ha: 'Rubuta take' },
    { key: 'bio', done: (p.bio?.trim().length ?? 0) >= 40, en: 'Say a little about yourself', ha: 'Faɗi kaɗan game da kanka' },
    { key: 'skills', done: p.skills.length >= 3, en: 'List at least 3 skills', ha: 'Lissafa ƙwarewa 3 ko fiye' },
    { key: 'location', done: Boolean(p.state), en: 'Add where you live', ha: 'Saka inda kake zaune' },
    { key: 'work', done: portfolioItems > 0 || p.links.length > 0, en: 'Show a project or a link to your work', ha: 'Nuna aiki ko hanyar haɗi zuwa aikinka' },
  ];
  const done = items.filter((i) => i.done).length;
  return { items, done, pct: Math.round((done / items.length) * 100) };
}
