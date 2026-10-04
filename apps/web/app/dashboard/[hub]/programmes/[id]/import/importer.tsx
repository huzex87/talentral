'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { IMPORT_STATUSES, MAX_IMPORT_ROWS, STATUS_LABELS, checkRows, guessMapping, parseCsv, type FormField, type Target } from '@talentral/domain';
import { Alert, Button, Card, Select, cx } from '@/components/ui';
import { readXlsx } from '@/lib/xlsx';
import { importBatch } from './actions';

const CHUNK = 500;
const CORE: { value: Target; label: string }[] = [
  { value: 'full_name', label: 'Full name' },
  { value: 'first_name', label: 'First name' },
  { value: 'last_name', label: 'Last name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'track', label: 'Track' },
];

type Totals = { imported: number; skipped: number; rejected: number };

const csvCell = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
function download(name: string, rows: string[][]) {
  const blob = new Blob([`﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}

export function Importer({ slug, programmeId, fields, tracks }: { slug: string; programmeId: string; fields: FormField[]; tracks: string[] }) {
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Target[]>([]);
  const [status, setStatus] = useState<string>('accepted');
  const [attested, setAttested] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);

  const questions = fields.filter((f) => f.type !== 'file');
  const targets: { value: Target; label: string }[] = [
    ...CORE.filter((c) => c.value !== 'track' || tracks.length),
    ...questions.map((f) => ({ value: `answer:${f.id}` as Target, label: f.label })),
  ];
  const checks = useMemo(() => (rows.length ? checkRows(rows, mapping, fields, tracks) : []), [rows, mapping, fields, tracks]);
  const good = checks.filter((c) => c.value).length;
  const bad = checks.filter((c) => !c.value);
  const hasName = mapping.includes('full_name') || mapping.includes('first_name');
  const hasEmail = mapping.includes('email');

  async function choose(file: File | undefined) {
    setError(''); setTotals(null); setProgress(null);
    if (!file) return;
    try {
      const all = /\.xlsx$/i.test(file.name) ? await readXlsx(file) : /\.(csv|txt)$/i.test(file.name) ? parseCsv(await file.text()) : null;
      if (!all) throw new Error('Choose a .csv or .xlsx file. For older .xls files, open them in Excel and save as .xlsx or CSV.');
      if (all.length < 2) throw new Error('The file needs a header row and at least one participant.');
      if (all.length - 1 > MAX_IMPORT_ROWS) throw new Error(`Import at most ${MAX_IMPORT_ROWS} participants at a time.`);
      const head = all[0]!.map((h) => h.trim());
      setFileName(file.name);
      setHeaders(head);
      setRows(all.slice(1).map((r) => head.map((_, i) => r[i] ?? '')));
      setMapping(guessMapping(head, fields));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This file could not be read.');
      setHeaders([]); setRows([]);
    }
  }

  async function run() {
    setError('');
    const sum: Totals = { imported: 0, skipped: 0, rejected: 0 };
    setProgress(0);
    for (let i = 0; i < rows.length; i += CHUNK) {
      const r = await importBatch(slug, programmeId, status, mapping, rows.slice(i, i + CHUNK), attested).catch(() => null);
      if (!r) { setError('The connection dropped part-way. Upload the same file again: people already imported are skipped.'); break; }
      if (!r.ok && r.message && r.message !== 'No valid rows in this batch.') { setError(r.message); break; }
      sum.imported += r.imported; sum.skipped += r.skipped; sum.rejected += r.rejected;
      setProgress(Math.min(1, (i + CHUNK) / rows.length));
    }
    setTotals(sum);
  }

  const reset = () => { setHeaders([]); setRows([]); setMapping([]); setTotals(null); setProgress(null); setFileName(''); setAttested(false); };
  const template = () => download('talentral-participants-template.csv', [
    ['Full name', 'Email', 'Phone', ...(tracks.length ? ['Track'] : []), ...questions.map((q) => q.label)],
    ['Aisha Musa', 'aisha@example.com', '0803 123 4567', ...(tracks.length ? [tracks[0]!] : []), ...questions.map(() => '')],
  ]);

  if (totals) {
    return (
      <Card className="p-6 sm:p-8">
        <p className="text-sm font-semibold text-teal-700">Import complete</p>
        <h2 className="mt-2 text-2xl font-semibold">{totals.imported} {totals.imported === 1 ? 'participant' : 'participants'} imported</h2>
        <ul className="mt-3 space-y-1 text-[15px] text-muted">
          <li>Status: <b className="text-ink">{STATUS_LABELS[status as keyof typeof STATUS_LABELS]}</b></li>
          {totals.skipped > 0 && <li>{totals.skipped} skipped because they are already in this programme</li>}
          {totals.rejected > 0 && <li>{totals.rejected} not imported because of problems in the file</li>}
        </ul>
        {error && <div className="mt-4"><Alert tone="danger">{error}</Alert></div>}
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href={`/dashboard/${slug}/applications?programme=${programmeId}`} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0 h-10 px-4 text-sm bg-blue text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(16,24,40,0.10)] hover:bg-blue-600">View participants</Link>
          <Button variant="secondary" onClick={reset}>Import another file</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}

      <Card className="p-5 sm:p-6">
        <Step n={1} title="Choose a file" done={rows.length > 0} />
        <p className="mt-1 text-sm text-muted">A CSV or Excel (.xlsx) file with one participant per row and column headings in the first row. Only the first sheet is read.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex h-11 cursor-pointer items-center rounded-[var(--radius-control)] border border-dashed border-blue/50 bg-blue-50 px-5 text-[15px] font-semibold text-blue hover:bg-blue-50/70">
            {fileName ? 'Choose a different file' : 'Choose file'}
            <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" aria-label="Participants file" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {fileName ? <span className="text-sm"><b>{fileName}</b> · {rows.length} rows</span> : <button type="button" onClick={template} className="text-sm font-semibold text-blue hover:underline">Download a template</button>}
        </div>
      </Card>

      {rows.length > 0 && (
        <Card className="p-5 sm:p-6">
          <Step n={2} title="Match the columns" done={hasName && hasEmail} />
          <p className="mt-1 text-sm text-muted">We matched what we could. Check each column and choose where it goes; columns set to “Don't import” are left out.</p>
          <div className="mt-4 divide-y divide-line rounded-[var(--radius-control)] border border-line">
            {headers.map((h, i) => (
              <div key={i} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_240px] sm:items-center">
                <p className="truncate font-semibold">{h || <span className="text-muted">Column {i + 1}</span>}</p>
                <p className="truncate text-sm text-muted">{rows.find((r) => r[i]?.trim())?.[i] ?? 'Empty'}</p>
                <Select value={mapping[i]} aria-label={`Column ${h || i + 1}`} onChange={(e) => {
                  const next = [...mapping];
                  const t = e.target.value as Target;
                  const clash = next.indexOf(t);
                  if (t !== 'ignore' && clash >= 0) next[clash] = 'ignore'; // one column per field
                  next[i] = t;
                  setMapping(next);
                }}>
                  <option value="ignore">Don't import</option>
                  {targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </div>
            ))}
          </div>
          {(!hasName || !hasEmail) && <p className="mt-3 text-sm font-semibold text-danger">Match a column to {!hasName ? 'the name' : ''}{!hasName && !hasEmail ? ' and ' : ''}{!hasEmail ? 'email' : ''} to continue.</p>}
        </Card>
      )}

      {rows.length > 0 && hasName && hasEmail && (
        <Card className="p-5 sm:p-6">
          <Step n={3} title="Check and import" done={false} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[var(--radius-control)] bg-teal-50 p-4"><p className="text-3xl font-semibold text-teal-700">{good}</p><p className="text-sm text-teal-700">ready to import</p></div>
            <div className={cx('rounded-[var(--radius-control)] p-4', bad.length ? 'bg-danger-50' : 'bg-canvas')}>
              <p className={cx('text-3xl font-semibold', bad.length ? 'text-danger' : 'text-muted')}>{bad.length}</p>
              <p className={cx('text-sm', bad.length ? 'text-danger' : 'text-muted')}>{bad.length ? 'with problems (left out)' : 'problems'}</p>
            </div>
          </div>
          {bad.length > 0 && (
            <div className="mt-4">
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-[var(--radius-control)] border border-line p-3 text-sm">
                {bad.slice(0, 100).map((c) => <li key={c.row}><b>Row {c.row}:</b> {c.errors.join(' ')}</li>)}
                {bad.length > 100 && <li className="text-muted">…and {bad.length - 100} more.</li>}
              </ul>
              <button type="button" className="mt-2 text-sm font-semibold text-blue hover:underline"
                onClick={() => download('rows-to-fix.csv', [['Row', 'Problem', ...headers], ...bad.map((c) => [String(c.row), c.errors.join(' '), ...rows[c.row - 2]!])])}>
                Download rows with problems
              </button>
              <p className="mt-1 text-xs text-muted">Fix them in the file and upload it again. People already imported are skipped automatically.</p>
            </div>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-[240px_minmax(0,1fr)] sm:items-start">
            <label className="space-y-1.5"><span className="text-sm font-semibold">Start them as</span>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {IMPORT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </Select>
            </label>
            <p className="text-sm text-muted sm:pt-7">Use <b>Accepted</b> when selection is already final, for example when it was done on the funder's platform. Imported participants are marked as imported in lists and reports.</p>
          </div>
          <label className="mt-4 flex items-start gap-2.5 rounded-[var(--radius-control)] border border-line bg-canvas p-3 text-sm">
            <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-blue" />
            <span>I confirm these participants agreed to share their details with our hub for this programme, as required by the Nigeria Data Protection Act 2023.</span>
          </label>

          {progress !== null && (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-blue transition-[width]" style={{ width: `${Math.max(4, progress * 100)}%` }} />
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button disabled={!good || !attested || progress !== null} onClick={() => void run()}>
              {progress !== null ? `Importing… ${Math.round(progress * 100)}%` : `Import ${good} ${good === 1 ? 'participant' : 'participants'}`}
            </Button>
            <Link href={`/dashboard/${slug}/programmes/${programmeId}`} className="inline-flex h-11 items-center px-3 text-[15px] font-semibold text-muted hover:text-ink">Cancel</Link>
          </div>
          <p className="mt-2 text-xs text-muted">No emails are sent during the import. You can message participants afterwards from the applications list.</p>
        </Card>
      )}
    </div>
  );
}

function Step({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <h2 className="flex items-center gap-3 text-lg font-semibold">
      <span className={cx('flex size-7 items-center justify-center rounded-full text-sm font-bold', done ? 'bg-teal text-white' : 'bg-blue-50 text-blue')}>{done ? '✓' : n}</span>
      {title}
    </h2>
  );
}
