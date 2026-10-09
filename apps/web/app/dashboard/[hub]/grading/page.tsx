import Link from 'next/link';
import { withUser } from '@talentral/db';
import { Badge, Card, EmptyState, PageHeader, Select, cx } from '@/components/ui';
import { hubAccess } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { aiEnabled } from '@/lib/ai';
import { levelFor, type RubricCriterion } from '@talentral/domain';
import { GradeForm, PeerReviews, type PeerReview } from './grade-form';
import { Paperclip, ClipboardCheck } from 'lucide-react';
import { FilterBar } from '@/components/filter-bar';

export const metadata = { title: 'Grading' };

type Row = { id: string; attempt: number; body: string | null; url: string | null; file_name: string | null; status: 'submitted' | 'graded' | 'resubmit';
  score: string | null; feedback: string | null; submitted_at: Date; graded_at: Date | null; learner: string; reference: string; lesson: string; lesson_id: string; course: string; cohort: string; cohort_id: string };

const STATUS = [['submitted', 'To grade'], ['resubmit', 'Sent back'], ['graded', 'Graded'], ['all', 'All']] as const;

export default async function Grading({ params, searchParams }: { params: Promise<{ hub: string }>; searchParams: Promise<{ status?: string; cohort?: string }> }) {
  const { hub: slug } = await params;
  const sp = await searchParams;
  const { user, hub } = await hubAccess(slug);
  const ai = aiEnabled();
  const status = STATUS.some(([k]) => k === sp.status) ? sp.status! : 'submitted';
  const cohort = sp.cohort && /^[0-9a-f-]{36}$/.test(sp.cohort) ? sp.cohort : null;
  const { rows, cohorts, counts, rubrics, peers, marks } = await withUser(user.id, async (tx) => {
    const data = await (async () => ({
    rows: await tx<Row[]>`
      select s.id, s.attempt, s.body, s.url, s.file_name, s.status, s.score, s.feedback, s.submitted_at, s.graded_at,
        a.full_name as learner, a.reference, l.title as lesson, l.id as lesson_id, c.title as course, co.name as cohort, co.id as cohort_id
      from public.submissions s join public.enrolments e on e.id = s.enrolment_id join public.applications a on a.id = e.application_id
      join public.lessons l on l.id = s.lesson_id join public.courses c on c.id = l.course_id join public.cohorts co on co.id = e.cohort_id
      where s.tenant_id = ${hub.id} and (${status} = 'all' or s.status = ${status}) and (${cohort}::uuid is null or e.cohort_id = ${cohort})
      order by case when s.status = 'submitted' then s.submitted_at end asc nulls last, s.submitted_at desc limit 200`,
    cohorts: await tx<{ id: string; name: string }[]>`select id, name from public.cohorts where tenant_id = ${hub.id} and (course_id is not null or path_id is not null) order by created_at desc`,
    counts: (await tx<{ status: string; n: number }[]>`select status, count(*)::int as n from public.submissions where tenant_id = ${hub.id} group by status`)
      .reduce<Record<string, number>>((m, r) => ({ ...m, [r.status]: r.n }), {}),
    }))();
    const lessonIds = [...new Set(data.rows.map((r) => r.lesson_id))];
    const subIds = data.rows.map((r) => r.id);
    const rubricRows = await tx<(RubricCriterion & { lesson_id: string })[]>`
      select id, lesson_id, title, levels from public.rubric_criteria where lesson_id = any(${lessonIds}::uuid[]) order by position, created_at`;
    const peerRows = await tx<(PeerReview & { submission_id: string })[]>`
      select id, submission_id, marks, comment, completed_at::text, hidden from public.peer_reviews where submission_id = any(${subIds}::uuid[]) order by completed_at nulls last`;
    const markRows = await tx<{ submission_id: string; criterion_id: string; points: string; comment: string | null }[]>`
      select submission_id, criterion_id, points, comment from public.submission_marks where submission_id = any(${subIds}::uuid[])`;
    const group = <T extends object>(items: T[], key: (t: T) => string) => items.reduce<Record<string, T[]>>((m, t) => { (m[key(t)] ??= []).push(t); return m; }, {});
    return { ...data, rubrics: group(rubricRows, (r) => r.lesson_id), peers: group(peerRows, (p) => p.submission_id), marks: group(markRows, (m) => m.submission_id) };
  });

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
          <FilterBar collapse={false} applyLabel="Filter" ariaLabel="Filter by cohort">
            <input type="hidden" name="status" value={status} />
            <Select name="cohort" defaultValue={cohort ?? ''} aria-label="Cohort" className="h-9"><option value="">All cohorts</option>{cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          </FilterBar>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title={status === 'submitted' ? 'Nothing to grade' : 'No work here'}>{status === 'submitted' ? 'When learners hand in assignments, they appear here.' : 'Try another filter.'}</EmptyState>
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
                  {r.file_name && <a href={`/learn/submission/${r.id}`} className="inline-flex items-center gap-1 font-semibold text-blue hover:underline"><Paperclip className="size-3.5" aria-hidden />{r.file_name}</a>}
                </div>
                <PeerReviews slug={slug} reviews={peers[r.id] ?? []} rubric={rubrics[r.lesson_id] ?? []} />
                {r.status === 'submitted' ? <div className="mt-4"><GradeForm slug={slug} submissionId={r.id} name={r.learner} rubric={rubrics[r.lesson_id] ?? []} ai={ai} canDraft={Boolean(r.body?.trim() || r.url)} /></div> : (
                  <div className="mt-3 space-y-1 text-sm text-muted">
                    {(marks[r.id] ?? []).length > 0 && (
                      <p>{(rubrics[r.lesson_id] ?? []).map((c) => {
                        const m = (marks[r.id] ?? []).find((x) => x.criterion_id === c.id);
                        return m ? `${c.title}: ${levelFor(c, Number(m.points))?.label ?? m.points}` : null;
                      }).filter(Boolean).join(' · ')}</p>
                    )}
                    {r.feedback && <p><b className="text-ink">Feedback:</b> {r.feedback}</p>}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
