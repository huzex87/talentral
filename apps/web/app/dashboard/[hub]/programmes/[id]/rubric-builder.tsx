'use client';
import { useState, useTransition } from 'react';
import { DEFAULT_RUBRIC, MAX_CRITERIA, fieldIdFromLabel, type Criterion } from '@talentral/domain';
import { Alert, Button, Card, Input, Select } from '@/components/ui';
import { saveRubric, type ProgState } from '../actions';

// Screening criteria for a programme. Once reviewers have scored, only names and guidance change.
export function RubricBuilder({ slug, programmeId, initial, scored }: { slug: string; programmeId: string; initial: Criterion[]; scored: number }) {
  const [criteria, setCriteria] = useState<Criterion[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<ProgState | null>(null);
  const [pending, start] = useTransition();
  const frozen = scored > 0;

  const update = (next: Criterion[]) => { setCriteria(next); setDirty(true); setResult(null); };
  const patch = (i: number, p: Partial<Criterion>) => update(criteria.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const possible = criteria.reduce((s, c) => s + c.max * c.weight, 0);

  return (
    <div className="space-y-4">
      {frozen && (
        <Alert tone="amber" title={`${scored} ${scored === 1 ? 'scoresheet' : 'scoresheets'} submitted`}>
          To keep every applicant comparable, criteria, maximum scores and weights are now fixed. You can still rename criteria and edit their guidance.
        </Alert>
      )}

      {criteria.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="font-semibold">No screening rubric yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">A rubric lets your team score applicants on the same criteria and rank them fairly. Start from our recommended rubric and adjust it.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button type="button" onClick={() => update(DEFAULT_RUBRIC)}>Use recommended rubric</Button>
            <Button type="button" variant="ghost" onClick={() => update([{ id: 'criterion', label: 'New criterion', max: 5, weight: 1 }])}>Start from scratch</Button>
          </div>
        </Card>
      ) : (
        <ol className="space-y-3">
          {criteria.map((c, i) => {
            const share = possible ? Math.round((c.max * c.weight / possible) * 100) : 0;
            return (
              <li key={c.id}>
                <Card className="p-4">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px_120px_auto] sm:items-end">
                    <label className="space-y-1.5"><span className="text-sm font-semibold">Criterion {i + 1}</span>
                      <Input value={c.label} maxLength={120} onChange={(e) => patch(i, { label: e.target.value })} aria-label={`Criterion ${i + 1} name`} /></label>
                    <label className="space-y-1.5"><span className="text-sm font-semibold">Scored out of</span>
                      <Select value={c.max} disabled={frozen} onChange={(e) => patch(i, { max: Number(e.target.value) })} aria-label={`Criterion ${i + 1} maximum`}>
                        {[1, 2, 3, 4, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                      </Select></label>
                    <label className="space-y-1.5"><span className="text-sm font-semibold">Importance</span>
                      <Select value={c.weight} disabled={frozen} onChange={(e) => patch(i, { weight: Number(e.target.value) })} aria-label={`Criterion ${i + 1} weight`}>
                        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{['', 'Normal', 'Higher', 'High', 'Very high', 'Critical'][n]} (×{n})</option>)}
                      </Select></label>
                    <div className="flex items-center gap-2 pb-1 sm:justify-end">
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue" title="Share of the total score">{share}%</span>
                      <button type="button" disabled={frozen} onClick={() => update(criteria.filter((_, j) => j !== i))} aria-label={`Remove criterion ${i + 1}`}
                        className="flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-canvas hover:text-danger disabled:opacity-30">✕</button>
                    </div>
                    <label className="space-y-1.5 sm:col-span-4"><span className="text-sm font-semibold">Guidance for reviewers <span className="font-normal text-muted">(optional)</span></span>
                      <Input value={c.help ?? ''} maxLength={300} placeholder="What does a high score look like?" onChange={(e) => patch(i, { help: e.target.value })} aria-label={`Criterion ${i + 1} guidance`} /></label>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      {criteria.length > 0 && !frozen && criteria.length < MAX_CRITERIA && (
        <Button type="button" variant="secondary" onClick={() => update([...criteria, { id: fieldIdFromLabel('Criterion', criteria.map((c) => c.id)), label: 'New criterion', max: 5, weight: 1 }])}>
          Add a criterion
        </Button>
      )}

      {(dirty || result) && (
        <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          <Button type="button" disabled={pending || !dirty} onClick={() => start(async () => {
            const r = await saveRubric(slug, programmeId, criteria);
            setResult(r);
            if (r.ok) setDirty(false);
          })}>{pending ? 'Saving…' : 'Save rubric'}</Button>
          {dirty && !pending && <span className="text-sm text-muted">Unsaved changes</span>}
          {result && <div className="w-full sm:w-auto sm:flex-1"><Alert tone={result.ok ? 'teal' : 'danger'}>{result.message}</Alert></div>}
        </div>
      )}
    </div>
  );
}
