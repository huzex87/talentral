import Link from 'next/link';
import { withUser } from '@talentral/db';
import { Badge, Button, Card, EmptyState, PageHeader, Select, cx } from '@/components/ui';
import { hubAccess } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { GradeForm } from './grade-form';

export const metadata = { title: 'Grading' };

type Row = { id: string; attempt: number; body: string | null; url: string | null; file_name: string | null; status: 'submitted' | 'graded' | 'resubmit';
  score: string | null; feedback: string | null; submitted_at: Date; graded_at: Date | null; learner: string; reference: string; lesson: string; course: string; cohort: string; cohort_id: string };

const STATUS = [['submitted', 'To grade'], ['resubmit', 'Sent back'], ['graded', 'Graded'], ['all', 'All']] as const;

export default async function Grading({ params, searchParams }: { params: Promise<{ hub: string }>; searchParams: Promise<{ status?: string; cohort?: string }> }) {
  const { hub: slug } = await params;
  const sp = await searchParams;
  const { user, hub } = await hubAccess(slug);
  const status = STATUS.some(([k]) => k === sp.status) ? sp.status! : 'submitted';
  const cohort = sp.cohort && /^[0-9a-f-]{36}$/.test(sp.cohort) ? sp.cohort : null;
  const { rows, cohorts, counts } = await withUser(user.id, async (tx) => ({
    rows: await tx<Row[]>`
      select s.id, s.attempt, s.body, s.url, s.file_name, s.status, s.score, s.feedback, s.submitted_at, s.graded_at,
        a.full_name as learner, a.reference, l.title as lesson, c.title as course, co.name as cohort, co.id as cohort_id
      from public.submissions s join public.enrolments e on e.id = s.enrolment_id join public.applications a on a.id = e.application_id
      join public.lessons l on l.id = s.lesson_id join public.courses c on c.id = l.course_id join public.cohorts co on co.id = e.cohort_id
      where s.tenant_id = ${hub.id} and (${status} = 'all' or s.status = ${status}) and (${cohort}::uuid is null or e.cohort_id = ${cohort})
      order by case when s.status = 'submitted' then s.submitted_at end asc nulls last, s.submitted_at desc limit 200`,
    cohorts: await tx<{ id: string; name: string }[]>`select id, name from public.cohorts where tenant_id = ${hub.id} and course_id is not null order by created_at desc`,
    counts: (await tx<{ status: string; n: number }[]>`select status, count(*)::int as n from public.submissions where tenant_id = ${hub.id} group by status`)
      .reduce<Record<string, number>>((m, r) => ({ ...m, [r.status]: r.n }), {}),
  }));

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader label="Learning" title="Grading" description="Assignments handed in by your learners, oldest first. A grade goes into the cohort’s gradebook and counts towards completion, certificates and proven skills." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 rounded-xl bg-white p-1 shadow-[var(--shadow-card)]" aria-label="Filter by status">
          {STATUS.map(([k, label]) => (
            <Link key={k} href={`?${new URLSearchParams({ status: k, ...(cohort ? { cohort } : {}) })}`} aria-current={status === k ? 'true' : undefined}
              className={cx('rounded-lg px-3 py-1.5 text-sm font-semibold', status === k ? 'bg-blue-50 text-blue' : 'text-muted hover:text-ink')}>
              {label}{k !== 'all' && counts[k] ? ` (${counts[k]})` : ''}
            </Link>
          ))}
        </nav>
        {cohorts.length > 1 && (
          <form className="flex gap-2">
            <input type="hidden" name="status" value={status} />
            <Select name="cohort" defaultValue={cohort ?? ''} aria-label="Cohort"><option value="">All cohorts</option>{cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
            <Button type="submit" variant="secondary" size="sm">Filter</Button>
          </form>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState title={status === 'submitted' ? 'Nothing to grade' : 'No work here'}>{status === 'submitted' ? 'When learners hand in assignments, they appear here.' : 'Try another filter.'}</EmptyState>
      ) : (
        <ul className="space-y-3" aria-label="Submissions">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.learner} <span className="font-mono text-xs font-normal text-muted">{r.reference}</span></p>
                    <p className="text-sm text-muted">{r.lesson} · {r.course} · {r.cohort} · attempt {r.attempt} · {formatDate(r.submitted_at, true)}</p>
                  </div>
                  <Badge tone={r.status === 'graded' ? 'teal' : r.status === 'resubmit' ? 'amber' : 'blue'}>{r.status === 'graded' ? `Graded ${Number(r.score)}%` : r.status === 'resubmit' ? 'Sent back' : 'To grade'}</Badge>
                </div>
                <div className="mt-3 space-y-2 rounded-xl bg-canvas/70 p-3 text-sm">
                  {r.body && <p className="whitespace-pre-line">{r.body}</p>}
                  {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="block break-all font-semibold text-blue hover:underline">{r.url} ↗</a>}
                  {r.file_name && <a href={`/learn/submission/${r.id}`} className="inline-flex items-center gap-1 font-semibold text-blue hover:underline">📎 {r.file_name}</a>}
                </div>
                {r.status === 'submitted' ? <div className="mt-4"><GradeForm slug={slug} submissionId={r.id} name={r.learner} /></div>
                  : r.feedback && <p className="mt-3 text-sm text-muted"><b className="text-ink">Feedback:</b> {r.feedback}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
