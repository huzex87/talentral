import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser } from '@talentral/db';
import { ASSESSMENT_KINDS, type AssessmentKind } from '@talentral/domain';
import { PageHeader } from '@/components/ui';
import { hubAccess } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { Gradebook, type GradeRow } from './gradebook';

export const metadata = { title: 'Gradebook' };

export default async function AssessmentPage({ params }: { params: Promise<{ hub: string; id: string; aid: string }> }) {
  const { hub: slug, id, aid } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(aid)) notFound();
  const { user, hub } = await hubAccess(slug);
  const data = await withUser(user.id, async (tx) => {
    const [a] = await tx<{ id: string; title: string; kind: AssessmentKind; max_score: number; weight: number; due_on: string | null; cohort: string }[]>`
      select a.id, a.title, a.kind, a.max_score, a.weight, a.due_on::text, c.name as cohort
      from public.assessments a join public.cohorts c on c.id = a.cohort_id where a.id = ${aid} and a.cohort_id = ${id} and a.tenant_id = ${hub.id}`;
    if (!a) return null;
    const rows = await tx<GradeRow[]>`
      select e.id as enrolment_id, ap.full_name, ap.reference, r.score::text as score, r.feedback
      from public.enrolments e join public.applications ap on ap.id = e.application_id
      left join public.assessment_results r on r.enrolment_id = e.id and r.assessment_id = ${aid}
      where e.cohort_id = ${id} and e.status <> 'dropped' order by ap.full_name`;
    return { a, rows };
  });
  if (!data) notFound();
  const { a, rows } = data;
  const graded = rows.filter((r) => r.score !== null).length;

  return (
    <div className="max-w-4xl space-y-6">
      <Link href={`/dashboard/${slug}/cohorts/${id}`} className="text-sm font-semibold text-blue hover:underline">← {a.cohort}</Link>
      <PageHeader label={`${ASSESSMENT_KINDS[a.kind]} · gradebook`} title={a.title}
        description={`Scored out of ${a.max_score} · weight ×${a.weight}${a.due_on ? ` · due ${formatDate(a.due_on)}` : ''} · ${graded} of ${rows.length} graded`} />
      <p className="text-sm text-muted">Scores save as you move to the next field. Clear a score to remove it.</p>
      {rows.length === 0 ? <p className="text-sm text-muted">No learners in this cohort yet.</p> : <Gradebook slug={slug} assessmentId={a.id} max={a.max_score} rows={rows} />}
    </div>
  );
}
