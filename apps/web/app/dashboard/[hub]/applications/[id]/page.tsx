import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withUser, type Application, type Programme } from '@talentral/db';
import { STATUS_LABELS, nextStatuses, type ApplicationStatus, type FormField } from '@talentral/domain';
import { StatusBadge } from '@/components/status-badge';
import { Button, Card, PageHeader, Textarea } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { canManage, hubAccess } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { addNote, moveApplication } from './actions';

export const metadata = { title: 'Application' };

export default async function ApplicationPage({ params }: { params: Promise<{ hub: string; id: string }> }) {
  const { hub: slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user, hub, role } = await hubAccess(slug);
  const data = await withUser(user.id, async (tx) => {
    const [a] = await tx<(Application & { programme_title: string; form: FormField[] })[]>`
      select a.*, p.title as programme_title, p.form from public.applications a join public.programmes p on p.id = a.programme_id
      where a.id = ${id} and a.tenant_id = ${hub.id}`;
    if (!a) return null;
    const files = await tx<{ id: string; field_id: string; filename: string; size_bytes: number }[]>`select id, field_id, filename, size_bytes from public.application_files where application_id = ${id}`;
    const notes = await tx<{ id: string; body: string; created_at: Date; author: string | null }[]>`
      select n.id, n.body, n.created_at, coalesce(u.full_name, u.email) as author from public.application_notes n
      left join public.users u on u.id = n.author_id where n.application_id = ${id} order by n.created_at`;
    const history = canManage(role) ? await tx<{ action: string; metadata: Record<string, string>; at: Date; actor: string | null }[]>`
      select l.action, l.metadata, l.at, coalesce(u.full_name, u.email) as actor from public.audit_log l left join public.users u on u.id = l.actor_id
      where l.target_id = ${id} and l.action in ('application.submitted', 'application.status') order by l.at` : [];
    return { a, files, notes, history };
  });
  if (!data) notFound();
  const { a, files, notes, history } = data;
  const moves = nextStatuses(a.status as ApplicationStatus);
  const fileFor = (fieldId: string) => files.find((f) => f.field_id === fieldId);

  const show = (f: FormField) => {
    const v = a.answers[f.id];
    if (f.type === 'file') {
      const file = fileFor(f.id);
      return file ? <a className="font-semibold text-blue hover:underline" href={`/files/${file.id}`}>{file.filename} ({Math.ceil(file.size_bytes / 1024)} KB)</a> : <span className="text-muted">Not provided</span>;
    }
    if (v === undefined || v === null || v === '') return <span className="text-muted">Not answered</span>;
    if (Array.isArray(v)) return v.join(', ');
    if (f.type === 'yes_no') return v === 'yes' ? 'Yes' : 'No';
    if (f.type === 'date') return formatDate(String(v));
    return <span className="whitespace-pre-line">{String(v)}</span>;
  };

  return (
    <div className="max-w-5xl">
      <Link href={`/dashboard/${slug}/applications`} className="text-sm font-semibold text-blue hover:underline">← All applications</Link>
      <div className="mt-3"><PageHeader label={a.programme_title} title={a.full_name} description={<span className="inline-flex flex-wrap items-center gap-2"><StatusBadge status={a.status} /><span className="font-mono">{a.reference}</span><span>· submitted {formatDate(a.submitted_at, true)}</span></span>} /></div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Contact</h2>
            <dl className="mt-3 grid gap-4 text-[15px] sm:grid-cols-2">
              <div><dt className="text-sm text-muted">Email</dt><dd><a className="text-blue hover:underline" href={`mailto:${a.email}`}>{a.email}</a></dd></div>
              <div><dt className="text-sm text-muted">Phone</dt><dd><a className="text-blue hover:underline" href={`tel:${a.phone}`}>{a.phone}</a></dd></div>
              {a.track && <div><dt className="text-sm text-muted">Track</dt><dd>{a.track}</dd></div>}
              <div><dt className="text-sm text-muted">Consent given</dt><dd>{formatDate(a.consent_at, true)}</dd></div>
            </dl>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Answers</h2>
            <dl className="mt-3 divide-y divide-line">
              {a.form.map((f) => (<div key={f.id} className="py-3"><dt className="text-sm font-semibold text-muted">{f.label}</dt><dd className="mt-1 text-[15px]">{show(f)}</dd></div>))}
            </dl>
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Team notes</h2>
            <p className="text-sm text-muted">Visible to your hub team only, never to the applicant.</p>
            <ul className="mt-4 space-y-3">
              {notes.map((n) => (<li key={n.id} className="rounded-[var(--radius-control)] bg-canvas px-4 py-3"><p className="whitespace-pre-line text-[15px]">{n.body}</p><p className="mt-1 text-xs text-muted">{n.author} · {formatDate(n.created_at, true)}</p></li>))}
            </ul>
            <form action={addNote.bind(null, slug, a.id)} className="mt-4 space-y-3">
              <Textarea name="body" rows={3} maxLength={2000} placeholder="Add a note for your team" aria-label="New note" required />
              <SubmitButton size="sm" variant="secondary" pendingLabel="Adding…">Add note</SubmitButton>
            </form>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">Decision</h2>
            <p className="mt-2 text-[15px]">Current: <b>{STATUS_LABELS[a.status as ApplicationStatus]}</b></p>
            {moves.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {moves.map((m) => (
                  <form key={m} action={moveApplication.bind(null, slug, a.id, m)}>
                    <Button className="w-full" size="sm" variant={m === 'rejected' || m === 'withdrawn' ? 'danger' : m === 'shortlisted' || m === 'offered' || m === 'accepted' ? 'primary' : 'secondary'}>
                      {m === 'under_review' ? 'Start review' : `Mark as ${STATUS_LABELS[m].toLowerCase()}`}
                    </Button>
                  </form>
                ))}
              </div>
            ) : <p className="mt-2 text-sm text-muted">No further changes.</p>}
            <p className="mt-3 text-xs text-muted">Applicants are not notified automatically yet. Bulk emails and SMS come next.</p>
          </Card>
          {history.length > 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">History</h2>
              <ol className="mt-3 space-y-2.5 text-sm">
                {history.map((h, i) => (
                  <li key={i}><p>{h.action === 'application.submitted' ? 'Submitted' : `${STATUS_LABELS[h.metadata.from as ApplicationStatus] ?? h.metadata.from} → ${STATUS_LABELS[h.metadata.to as ApplicationStatus] ?? h.metadata.to}`}</p>
                    <p className="text-xs text-muted">{h.actor ?? 'Applicant'} · {formatDate(h.at, true)}</p></li>
                ))}
              </ol>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
