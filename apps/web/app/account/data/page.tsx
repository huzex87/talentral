// A person's own data as a readable document they can print or save as PDF (E13.2 asks for JSON
// and PDF). The same data as the JSON download: app.my_data only returns the signed-in person's.
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { system, withUser } from '@talentral/db';
import { TalentralLogo } from '@/components/logo';
import { requireUser } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { PrintButton } from '../../dashboard/[hub]/reports/print-button';
import { ChevronLeft } from 'lucide-react';

export const metadata = { title: 'Your data' };
export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Row[]) : []);
const text = (v: unknown) => (v === null || v === undefined || v === '' ? '–' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const when = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? formatDate(v, v.length > 10) : text(v));
const label = (k: string) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="break-inside-avoid-page space-y-3">
      <h2 className="border-b border-line pb-1.5 text-lg font-semibold">{title}{count !== undefined && <span className="ml-2 text-sm font-normal text-muted">{count}</span>}</h2>
      {children}
    </section>
  );
}

function Pairs({ data }: { data: Row }) {
  return (
    <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[180px_minmax(0,1fr)]">
      {Object.entries(data).map(([k, v]) => <Fragment key={k}><dt className="text-muted">{label(k)}</dt><dd className="break-words">{/_at$|_on$|^at$/.test(k) ? when(v) : text(v)}</dd></Fragment>)}
    </dl>
  );
}

function Table({ rows, cols, label }: { rows: Row[]; cols: [string, string][]; label: string }) {
  if (!rows.length) return <p className="text-sm text-muted">None.</p>;
  return (
    <div className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-blue" tabIndex={0} role="region" aria-label={label}>
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="border-b border-line text-xs text-muted"><tr>{cols.map(([, h]) => <th key={h} className="py-1.5 pr-3 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{rows.map((r, i) => <tr key={i} className="break-inside-avoid">{cols.map(([k]) => <td key={k} className="py-1.5 pr-3 align-top">{/_at$|^at$|starts_at/.test(k) ? when(r[k]) : text(r[k])}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default async function MyDataDocument() {
  const user = await requireUser();
  const [row] = await withUser(user.id, (tx) => tx<{ d: Row }[]>`select app.my_data() as d`);
  await system()`insert into public.audit_log (actor_id, action, target_type, target_id) values (${user.id}, 'account.data_exported', 'user', ${user.id})`;
  const d = row!.d;
  const account = (d.account ?? {}) as Row;
  const passport = d.passport as Row | null;
  const applications = list(d.applications);
  const enrolments = list(d.enrolments);
  return (
    <div className="min-h-dvh bg-canvas print:bg-white">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 print:p-0">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href="/account/privacy" className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-ink"><ChevronLeft className="size-4" aria-hidden />Your data</Link>
          <PrintButton />
        </div>
        <article className="space-y-8 rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-10 print:border-0 print:p-0 print:shadow-none" aria-label="Your data">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b-4 border-double border-line pb-5">
            <div>
              <p className="text-[13px] font-medium text-muted">Your data on Talentral</p>
              <h1 className="mt-1 text-2xl font-semibold">{text(account.full_name) === '–' ? user.email : text(account.full_name)}</h1>
              <p className="mt-1 text-sm text-muted">Prepared {formatDate(new Date(), true)} (WAT) at your request under the Nigeria Data Protection Act 2023.</p>
            </div>
            <TalentralLogo height={26} href={null} />
          </header>

          <Section title="Account"><Pairs data={account} /></Section>

          <Section title="Applications" count={applications.length}>
            {applications.length === 0 ? <p className="text-sm text-muted">None.</p> : applications.map((a, i) => (
              <div key={i} className="break-inside-avoid rounded-xl border border-line p-4">
                <p className="font-semibold">{text(a.programme)} <span className="font-normal text-muted">· {text(a.hub)}</span></p>
                <p className="text-xs text-muted">Reference {text(a.reference)} · {text(a.status)} · submitted {when(a.submitted_at)}</p>
                <div className="mt-3"><Pairs data={{ track: a.track, phone: a.phone, ...((a.answers ?? {}) as Row) }} /></div>
              </div>
            ))}
          </Section>

          <Section title="Learning" count={enrolments.length}>
            {enrolments.length === 0 ? <p className="text-sm text-muted">None.</p> : enrolments.map((e, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-line p-4">
                <p className="font-semibold">{text(e.cohort)} <span className="font-normal text-muted">· {text(e.hub)} · {text(e.status)} · enrolled {when(e.enrolled_at)}</span></p>
                {e.certificate ? <p className="text-sm">Certificate <span className="font-mono">{text((e.certificate as Row).serial)}</span>, issued {when((e.certificate as Row).issued_at)}{(e.certificate as Row).revoked_at ? ', withdrawn' : ''}</p> : null}
                <h3 className="text-[13px] font-medium text-muted">Attendance</h3>
                <Table label="Attendance" rows={list(e.attendance)} cols={[['session', 'Session'], ['starts_at', 'Date'], ['status', 'Mark'], ['method', 'How']]} />
                <h3 className="text-[13px] font-medium text-muted">Grades</h3>
                <Table label="Grades" rows={list(e.scores)} cols={[['assessment', 'Assessment'], ['score', 'Score'], ['max', 'Out of'], ['feedback', 'Feedback']]} />
                <h3 className="text-[13px] font-medium text-muted">Quizzes</h3>
                <Table label="Quizzes" rows={list(e.quiz_attempts)} cols={[['lesson', 'Quiz'], ['percent', '%'], ['passed', 'Passed'], ['submitted_at', 'When']]} />
                <h3 className="text-[13px] font-medium text-muted">Work handed in</h3>
                <Table label="Work handed in" rows={list(e.submissions)} cols={[['lesson', 'Assignment'], ['attempt', 'Try'], ['status', 'Status'], ['score', 'Score'], ['submitted_at', 'When']]} />
              </div>
            ))}
          </Section>

          <Section title="Talentral Passport">{passport ? <Pairs data={passport} /> : <p className="text-sm text-muted">You have not made a Passport.</p>}</Section>
          <Section title="Consents" count={list(d.consent_history).length}><Table label="Consents" rows={list(d.consent_history)} cols={[['kind', 'Consent'], ['granted', 'Given'], ['at', 'When']]} /></Section>
          <Section title="Job opportunities" count={list(d.opportunities).length}><Table label="Job opportunities" rows={list(d.opportunities)} cols={[['role', 'Role'], ['employer', 'Employer'], ['stage', 'Stage']]} /></Section>
          <Section title="Discussion posts" count={list(d.discussion_threads).length + list(d.discussion_posts).length}>
            <Table label="Discussion posts" rows={[...list(d.discussion_threads).map((t) => ({ what: `Started: ${text(t.title)}`, body: t.body, at: t.at })), ...list(d.discussion_posts).map((p) => ({ what: `Reply in: ${text(p.thread)}`, body: p.body, at: p.at }))]}
              cols={[['what', 'Post'], ['body', 'Text'], ['at', 'When']]} />
          </Section>

          <footer className="border-t border-line pt-4 text-xs text-muted">
            To correct or delete any of this, go to Your data in your Talentral account, or email privacy@talentral.ng. We answer within 30 days.
          </footer>
        </article>
      </div>
    </div>
  );
}
