'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { MARKS, MARK_LABELS, type Mark } from '@talentral/domain';
import { Alert, Button, Card, cx } from '@/components/ui';
import { markAttendance, markRemaining, setCheckin } from '../../../actions';

export interface RegisterRow { enrolment_id: string; full_name: string; reference: string; mark: Mark | null; method: 'register' | 'self' | 'join' | 'qr' | null }

const TONE: Record<Mark, string> = {
  present: 'border-teal-700 bg-teal-700 text-white', late: 'border-amber-800 bg-amber-50 text-amber-800',
  absent: 'border-danger bg-danger text-white', excused: 'border-violet bg-violet-50 text-violet',
};

// The facilitator's register. Every tap saves on its own, so a weak connection loses at most one mark.
export function Register({ slug, sessionId, rows }: { slug: string; sessionId: string; rows: RegisterRow[] }) {
  const [marks, setMarks] = useState<Record<string, Mark | null>>(() => Object.fromEntries(rows.map((r) => [r.enrolment_id, r.mark])));
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  // Self check-ins arrive from learners' phones; pick them up without losing local taps.
  useEffect(() => setMarks((m) => ({ ...Object.fromEntries(rows.map((r) => [r.enrolment_id, r.mark])), ...Object.fromEntries(Object.entries(m).filter(([, v]) => v)) })), [rows]);

  const set = (id: string, mark: Mark) => {
    const before = marks[id] ?? null;
    setMarks((m) => ({ ...m, [id]: mark }));
    markAttendance(slug, sessionId, id, mark).then((ok) => { if (!ok) throw new Error(); }).catch(() => {
      setMarks((m) => ({ ...m, [id]: before }));
      setFailed('A mark did not save. Check your connection and tap it again.');
    });
  };
  const counts = MARKS.map((m) => [m, Object.values(marks).filter((v) => v === m).length] as const);
  const unmarked = rows.length - Object.values(marks).filter(Boolean).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {counts.map(([m, n]) => <span key={m} className="rounded-full bg-white px-3 py-1 font-semibold shadow-sm ring-1 ring-line">{MARK_LABELS[m]} {n}</span>)}
        <span className="rounded-full px-3 py-1 text-muted">Not marked {unmarked}</span>
        {unmarked > 0 && (
          <Button size="sm" variant="secondary" className="ml-auto" disabled={pending} onClick={() => start(async () => { await markRemaining(slug, sessionId, 'absent'); router.refresh(); })}>
            Mark everyone else absent
          </Button>
        )}
      </div>
      {failed && <Alert tone="danger">{failed}</Alert>}
      <Card className="divide-y divide-line">
        {rows.map((r) => {
          const current = marks[r.enrolment_id];
          return (
            <div key={r.enrolment_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{r.full_name}</p>
                <p className="text-[12px] text-muted"><span className="font-mono">{r.reference}</span>{r.method && r.method !== 'register' && current === r.mark && <span className="text-teal-700"> · {r.method === 'join' ? 'joined online' : r.method === 'qr' ? 'scanned the room QR' : 'checked in on their phone'}</span>}</p>
              </div>
              <div className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${r.full_name}`}>
                {MARKS.map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={current === m} onClick={() => set(r.enrolment_id, m)}
                    className={cx('h-10 min-w-10 rounded-lg border px-2.5 text-sm font-semibold transition', current === m ? TONE[m] : 'border-line bg-white text-muted hover:border-blue/40 hover:text-ink')}>
                    <span className="sm:hidden" aria-hidden>{MARK_LABELS[m][0]}</span><span className="sr-only sm:not-sr-only">{MARK_LABELS[m]}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// The code learners type on their phones, and the switch that opens check-in.
export function CheckinPanel({ slug, sessionId, code, open, url }: { slug: string; sessionId: string; code: string; open: boolean; url: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [open, router]);
  const toggle = (next: boolean, newCode = false) => start(async () => { await setCheckin(slug, sessionId, next, newCode); router.refresh(); });

  return (
    <Card className={cx('p-5 sm:p-6', open && 'border-teal/50')}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">Self check-in</h2>
          <p className="mt-1 text-sm text-muted">Learners open <b className="font-semibold text-ink">{url.replace(/^https?:\/\//, '')}</b> and enter this code with their reference number or phone.</p>
        </div>
        <span className={cx('rounded-full px-3 py-1 text-xs font-bold', open ? 'bg-teal-50 text-teal-700' : 'bg-canvas text-muted')}>{open ? 'Open' : 'Closed'}</span>
      </div>
      <p className="mt-4 text-center font-mono text-5xl font-bold tracking-[0.3em] text-ink sm:text-6xl" aria-label={`Check-in code ${code.split('').join(' ')}`}>{code}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {open ? <Button variant="secondary" disabled={pending} onClick={() => toggle(false)}>Close check-in</Button> : <Button disabled={pending} onClick={() => toggle(true)}>Open check-in</Button>}
        <Button variant="ghost" disabled={pending} onClick={() => toggle(open, true)}>New code</Button>
      </div>
      {open && <p className="mt-3 text-center text-xs text-muted">Check-ins appear below automatically. Arriving more than 15 minutes after the start counts as late.</p>}
    </Card>
  );
}
