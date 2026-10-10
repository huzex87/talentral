// Search for the command palette (Ctrl+K): applicants and learners by name, email, phone or
// reference, and cohorts, courses and programmes by name. Row-level security keeps every result
// inside the caller's hub; reviewers only see the sections they can open, and facilitators find
// learners in their cohorts rather than applicants.
import { withUser } from '@talentral/db';
import { canManage, canSelect, hubAccess } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export interface SearchHit { group: 'Applicants' | 'Learners' | 'Cohorts' | 'Courses' | 'Programmes'; title: string; detail: string; href: string }

export async function GET(req: Request, { params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const { user, hub, role } = await hubAccess(slug);
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 80);
  if (q.length < 2) return Response.json({ hits: [] });
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const base = `/dashboard/${slug}`;
  const manage = canManage(role);
  const select = canSelect(role);
  const hits = await withUser(user.id, async (tx) => {
    const starts = `${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    const people = select ? await tx<{ id: string; full_name: string; reference: string; status: string; programme: string }[]>`
      select a.id, a.full_name, a.reference, a.status, p.title as programme from public.applications a join public.programmes p on p.id = a.programme_id
      where a.tenant_id = ${hub.id} and (a.full_name ilike ${like} or a.email::text ilike ${like} or a.reference ilike ${like} or a.phone ilike ${like})
      order by (a.full_name ilike ${starts}) desc, a.submitted_at desc limit 6` : [];
    const learners = select ? [] : await tx<{ full_name: string; reference: string; cohort_id: string; cohort: string }[]>`
      select a.full_name, a.reference, c.id as cohort_id, c.name as cohort
      from public.enrolments e join public.applications a on a.id = e.application_id join public.cohorts c on c.id = e.cohort_id
      where e.tenant_id = ${hub.id} and (a.full_name ilike ${like} or a.email::text ilike ${like} or a.reference ilike ${like} or a.phone ilike ${like})
      order by (a.full_name ilike ${starts}) desc, e.enrolled_at desc limit 6`;
    const cohorts = await tx<{ id: string; name: string; programme: string }[]>`
      select c.id, c.name, p.title as programme from public.cohorts c join public.programmes p on p.id = c.programme_id
      where c.tenant_id = ${hub.id} and c.name ilike ${like} order by c.created_at desc limit 4`;
    const courses = manage ? await tx<{ id: string; title: string; status: string }[]>`
      select id, title, status from public.courses where tenant_id = ${hub.id} and title ilike ${like} order by updated_at desc limit 4` : [];
    const programmes = manage ? await tx<{ id: string; title: string; status: string }[]>`
      select id, title, status from public.programmes where tenant_id = ${hub.id} and title ilike ${like} order by created_at desc limit 4` : [];
    const label = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
    return [
      ...people.map((p): SearchHit => ({ group: 'Applicants', title: p.full_name, detail: `${p.reference} · ${label(p.status)} · ${p.programme}`, href: `${base}/applications/${p.id}` })),
      ...learners.map((l): SearchHit => ({ group: 'Learners', title: l.full_name, detail: `${l.reference} · ${l.cohort}`, href: `${base}/cohorts/${l.cohort_id}` })),
      ...cohorts.map((c): SearchHit => ({ group: 'Cohorts', title: c.name, detail: c.programme, href: `${base}/cohorts/${c.id}` })),
      ...courses.map((c): SearchHit => ({ group: 'Courses', title: c.title, detail: label(c.status), href: `${base}/courses/${c.id}` })),
      ...programmes.map((p): SearchHit => ({ group: 'Programmes', title: p.title, detail: label(p.status), href: `${base}/programmes/${p.id}` })),
    ];
  });
  return Response.json({ hits }, { headers: { 'cache-control': 'no-store' } });
}
