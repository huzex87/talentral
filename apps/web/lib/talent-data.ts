import 'server-only';
// Talent officer reads. Row-Level Security limits every query here to Passports whose owners
// have consented to be found; learning records come from app.learning_record under the same rule.
import type { Tx } from '@talentral/db';
import { readinessLevel, type Readiness, type WorkAvailability } from '@talentral/domain';

export interface TalentRow {
  user_id: string; full_name: string | null; email: string; headline: string | null; state: string | null; city: string | null;
  languages: string[]; skills: string[]; availability: WorkAvailability; work_modes: string[]; job_types: string[];
  verified_at: Date | null; updated_at: Date; enrolments: number; certificates: number; tracks: string[]; programmes: string[]; hubs: string[];
  evidenced: string[];
  readiness: Readiness;
}

// Talent officers see Passports open to them; verified employers see those open to employer search.
export async function discoverableTalent(tx: Tx, audience: 'officer' | 'employer' = 'officer'): Promise<TalentRow[]> {
  const rows = await tx<Omit<TalentRow, 'readiness'>[]>`
    select p.user_id, u.full_name, u.email::text, p.headline, p.state, p.city, p.languages, p.skills, p.availability, p.work_modes, p.job_types,
      p.verified_at, p.updated_at, lr.enrolments, lr.certificates, lr.tracks, lr.programmes, lr.hubs,
      coalesce((select array_agg(distinct ev.skill) from app.evidenced_skills(p.user_id) ev), '{}') as evidenced
    from public.passports p join public.users u on u.id = p.user_id
    cross join lateral (
      select count(*) filter (where r.enrolment_status <> 'dropped')::int as enrolments,
        count(*) filter (where r.certificate_serial is not null and not r.certificate_revoked)::int as certificates,
        coalesce(array_agg(distinct r.track) filter (where r.track is not null and r.certificate_serial is not null and not r.certificate_revoked), '{}') as tracks,
        coalesce(array_agg(distinct r.programme_title) filter (where r.certificate_serial is not null and not r.certificate_revoked), '{}') as programmes,
        coalesce(array_agg(distinct r.hub_name), '{}') as hubs
      from app.learning_record(p.user_id) r) lr
    where case when ${audience} = 'employer' then p.employer_search else p.discoverable end
    order by p.verified_at is not null desc, lr.certificates desc, p.updated_at desc`;
  return rows.map((r) => ({ ...r, readiness: readinessLevel({ enrolments: r.enrolments, certificates: r.certificates, verified: Boolean(r.verified_at) }) }));
}

export interface TalentFilters { q?: string; readiness?: string; state?: string; language?: string; availability?: string; work_mode?: string; hub?: string }

export function filterTalent(rows: TalentRow[], f: TalentFilters): TalentRow[] {
  const q = f.q?.trim().toLowerCase();
  return rows.filter((r) => {
    if (q && ![r.full_name ?? '', r.headline ?? '', ...r.skills, ...r.tracks, ...r.programmes, ...r.evidenced].some((s) => s.toLowerCase().includes(q))) return false;
    if (f.readiness && r.readiness !== f.readiness) return false;
    if (f.state && r.state !== f.state) return false;
    if (f.language && !r.languages.includes(f.language)) return false;
    if (f.availability && r.availability !== f.availability) return false;
    if (f.work_mode && !r.work_modes.includes(f.work_mode)) return false;
    if (f.hub && !r.hubs.includes(f.hub)) return false;
    return true;
  });
}
