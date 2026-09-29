'use client';
import { useState, useTransition } from 'react';
import { CORE_FIELD_LABELS, FIELD_TYPES, RECOMMENDED_FIELDS, fieldIdFromLabel, type FieldType, type FormField } from '@talentral/domain';
import { Alert, Button, Card, Input, Select, Textarea, cx } from '@/components/ui';
import { saveForm, type ProgState } from '../actions';

const TYPE_LABELS: Record<FieldType, string> = {
  short_text: 'Short answer', long_text: 'Paragraph', number: 'Number', date: 'Date',
  select: 'Dropdown (one choice)', multi_select: 'Checkboxes (many choices)', yes_no: 'Yes or no', file: 'File upload',
};

export function FormBuilder({ slug, programmeId, initial, hasTracks }: { slug: string; programmeId: string; initial: FormField[]; hasTracks: boolean }) {
  const [fields, setFields] = useState<FormField[]>(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [result, setResult] = useState<ProgState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();

  const update = (next: FormField[]) => { setFields(next); setDirty(true); setResult(null); };
  const patch = (i: number, p: Partial<FormField>) => update(fields.map((f, j) => (j === i ? { ...f, ...p } : f)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...fields];
    const [f] = next.splice(i, 1);
    next.splice(i + d, 0, f!);
    update(next);
  };
  const add = () => {
    const id = fieldIdFromLabel('New question', fields.map((f) => f.id));
    update([...fields, { id, label: 'New question', type: 'short_text', required: false }]);
    setOpen(id);
  };
  const missingRecommended = RECOMMENDED_FIELDS.filter((r) => !fields.some((f) => f.id === r.id));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Always asked</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(CORE_FIELD_LABELS).filter(([k]) => k !== 'track' || hasTracks).map(([k, l]) => (
            <span key={k} className="rounded-full border border-line bg-canvas px-3 py-1 text-sm">{l}</span>
          ))}
        </div>
      </Card>

      <ol className="space-y-3">
        {fields.map((f, i) => {
          const expanded = open === f.id;
          return (
            <li key={f.id}>
              <Card className={cx('p-4', expanded && 'border-blue/50')}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue">{i + 1}</span>
                  <button type="button" onClick={() => setOpen(expanded ? null : f.id)} className="min-w-0 flex-1 text-left">
                    <p className="font-semibold">{f.label || 'Untitled question'}{f.required && <span className="text-danger"> *</span>}</p>
                    <p className="text-sm text-muted">{TYPE_LABELS[f.type]}{f.options?.length ? ` · ${f.options.length} options` : ''}</p>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</IconButton>
                    <IconButton label="Move down" disabled={i === fields.length - 1} onClick={() => move(i, 1)}>↓</IconButton>
                    <IconButton label="Delete question" onClick={() => update(fields.filter((_, j) => j !== i))}>✕</IconButton>
                  </div>
                </div>
                {expanded && (
                  <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
                    <label className="sm:col-span-2 space-y-1.5"><span className="text-sm font-semibold">Question</span>
                      <Input value={f.label} maxLength={200} onChange={(e) => patch(i, { label: e.target.value })} /></label>
                    <label className="space-y-1.5"><span className="text-sm font-semibold">Answer type</span>
                      <Select value={f.type} onChange={(e) => {
                        const type = e.target.value as FieldType;
                        patch(i, { type, options: type === 'select' || type === 'multi_select' ? (f.options?.length ? f.options : ['Option 1', 'Option 2']) : undefined });
                      }}>
                        {FIELD_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                      </Select></label>
                    <label className="flex items-center gap-2.5 self-end pb-2.5 text-sm font-semibold">
                      <input type="checkbox" checked={f.required} onChange={(e) => patch(i, { required: e.target.checked })} className="size-4 accent-blue" /> Required
                    </label>
                    {(f.type === 'select' || f.type === 'multi_select') && (
                      <label className="sm:col-span-2 space-y-1.5"><span className="text-sm font-semibold">Options (one per line)</span>
                        <Textarea rows={4} value={(f.options ?? []).join('\n')} onChange={(e) => patch(i, { options: e.target.value.split('\n') })} /></label>
                    )}
                    <label className="sm:col-span-2 space-y-1.5"><span className="text-sm font-semibold">Help text (optional)</span>
                      <Input value={f.help ?? ''} maxLength={300} onChange={(e) => patch(i, { help: e.target.value })} /></label>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={add}>Add a question</Button>
        {missingRecommended.length > 0 && (
          <Button type="button" variant="ghost" onClick={() => update([...fields, ...missingRecommended])}>Add recommended questions ({missingRecommended.length})</Button>
        )}
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <Button type="button" disabled={pending || !dirty} onClick={() => start(async () => {
          const r = await saveForm(slug, programmeId, fields.map((f) => ({ ...f, options: f.options?.map((o) => o.trim()).filter(Boolean) })));
          setResult(r);
          if (r.ok) setDirty(false);
        })}>{pending ? 'Saving…' : 'Save form'}</Button>
        {dirty && !pending && <span className="text-sm text-muted">Unsaved changes</span>}
        {result && <div className="w-full sm:w-auto sm:flex-1"><Alert tone={result.ok ? 'teal' : 'danger'}>{result.message}</Alert></div>}
      </div>
    </div>
  );
}

function IconButton({ label, children, ...props }: { label: string; children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} className="flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-canvas hover:text-ink disabled:opacity-30" {...props}>
      {children}
    </button>
  );
}
