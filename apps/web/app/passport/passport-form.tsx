'use client';
import { useActionState, useState, type KeyboardEvent } from 'react';
import { AVAILABILITY, JOB_TYPES, LANGUAGES, NIGERIAN_STATES, WORK_MODES } from '@talentral/domain';
import { Alert, Button, Field, Input, Select, Textarea, cx } from '@/components/ui';
import { keepValues } from '@/lib/keep-values';
import type { Passport } from '@/lib/passport-data';
import { savePassport, type PassportState } from './actions';

const SUGGESTED = ['Digital marketing', 'Social media management', 'Content writing', 'Graphic design', 'Canva', 'Customer support',
  'Microsoft Excel', 'Data entry', 'HTML and CSS', 'JavaScript', 'React', 'Python', 'UI/UX design', 'Video editing', 'Virtual assistance'];

function Chips({ name, options, selected, labels }: { name: string; options: readonly string[]; selected: string[]; labels?: Record<string, string> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o} className="cursor-pointer">
          <input type="checkbox" name={name} value={o} defaultChecked={selected.includes(o)} className="peer sr-only" />
          <span className="inline-flex rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold text-muted transition peer-checked:border-blue peer-checked:bg-blue-50 peer-checked:text-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue/40">
            {labels?.[o] ?? o}
          </span>
        </label>
      ))}
    </div>
  );
}

function SkillInput({ initial, error }: { initial: string[]; error?: string }) {
  const [skills, setSkills] = useState(initial);
  const [draft, setDraft] = useState('');
  const add = (value: string) => {
    const v = value.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (v && !skills.some((s) => s.toLowerCase() === v.toLowerCase()) && skills.length < 30) setSkills([...skills, v]);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); }
    if (e.key === 'Backspace' && !draft && skills.length) setSkills(skills.slice(0, -1));
  };
  return (
    <Field label="Skills" htmlFor="skill-input" required error={error} hint="Type a skill and press Enter. Add at least 3. These show as self-declared; your certificates show as platform-evidenced.">
      <input type="hidden" name="skills" value={skills.join('\n')} />
      <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-white px-2 py-1.5 focus-within:border-blue focus-within:ring-2 focus-within:ring-blue/15">
        {skills.map((s) => (
          <span key={s} className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-2.5 pr-1 text-sm font-semibold text-blue-600">
            {s}
            <button type="button" onClick={() => setSkills(skills.filter((x) => x !== s))} aria-label={`Remove ${s}`} className="flex size-5 items-center justify-center rounded-full hover:bg-blue/15">×</button>
          </span>
        ))}
        <input id="skill-input" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={() => draft && add(draft)}
          placeholder={skills.length ? 'Add another' : 'e.g. Social media management'} className="min-w-40 flex-1 bg-transparent px-1 py-1 text-[15px] outline-none" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGESTED.filter((s) => !skills.some((x) => x.toLowerCase() === s.toLowerCase())).slice(0, 8).map((s) => (
          <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-dashed border-line px-2.5 py-1 text-xs font-semibold text-muted hover:border-blue/40 hover:text-blue">+ {s}</button>
        ))}
      </div>
    </Field>
  );
}

export function PassportForm({ p }: { p: Omit<Passport, 'user_id'> }) {
  const [state, action, pending] = useActionState<PassportState, FormData>(savePassport, {});
  const [links, setLinks] = useState(p.links.length ? p.links : [{ label: '', url: '' }]);
  const e = state.errors ?? {};

  return (
    <form onSubmit={keepValues(action)} className="space-y-6">
      {state.message && !state.ok && <Alert tone="danger">{state.message}</Alert>}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Headline" htmlFor="headline" required error={e.headline} hint="One line about the work you do or want to do.">
            <Input id="headline" name="headline" maxLength={120} defaultValue={p.headline ?? ''} placeholder="Digital marketer and content creator" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="About you" htmlFor="bio" error={e.bio} hint="What you are good at, what you have built, and what you are looking for.">
            <Textarea id="bio" name="bio" rows={5} maxLength={1500} defaultValue={p.bio ?? ''} />
          </Field>
        </div>
        <Field label="State" htmlFor="state" required error={e.state}>
          <Select id="state" name="state" defaultValue={p.state ?? ''}>
            <option value="">Choose a state</option>
            {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Town or city" htmlFor="city" error={e.city} hint="Only you and talent officers see this.">
          <Input id="city" name="city" maxLength={80} defaultValue={p.city ?? ''} placeholder="Katsina" />
        </Field>
        <div className="sm:col-span-2"><SkillInput initial={p.skills} error={e.skills} /></div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">How do you want to work? <span className="text-danger">*</span></legend>
        <Chips name="work_modes" options={Object.keys(WORK_MODES)} labels={WORK_MODES} selected={p.work_modes} />
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Open to</legend>
        <Chips name="job_types" options={Object.keys(JOB_TYPES)} labels={JOB_TYPES} selected={p.job_types} />
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Availability" htmlFor="availability" error={e.availability}>
          <Select id="availability" name="availability" defaultValue={p.availability}>
            {Object.entries(AVAILABILITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Languages you work in</legend>
        <Chips name="languages" options={LANGUAGES} selected={p.languages} />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Work samples and links</legend>
        <p className="text-sm text-muted">Portfolio, GitHub, LinkedIn, a website you built or a Google Drive folder of your work.</p>
        {e.links && <p className="text-sm font-semibold text-danger">{e.links}</p>}
        {links.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
            <Input name="link_label" aria-label={`Link ${i + 1} name`} defaultValue={l.label} placeholder="Portfolio" maxLength={40} />
            <Input name="link_url" aria-label={`Link ${i + 1} address`} defaultValue={l.url} placeholder="https://" type="url" inputMode="url" />
            <button type="button" onClick={() => setLinks(links.filter((_, j) => j !== i))} className="rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-canvas hover:text-danger">Remove</button>
          </div>
        ))}
        {links.length < 6 && <button type="button" onClick={() => setLinks([...links, { label: '', url: '' }])} className="text-sm font-semibold text-blue hover:underline">+ Add a link</button>}
      </fieldset>

      <label className={cx('flex items-start gap-3 rounded-xl border border-line bg-canvas/60 p-4 text-sm')}>
        <input type="checkbox" name="show_scores" defaultChecked={p.show_scores} className="mt-0.5 size-4 accent-[var(--color-blue)]" />
        <span><b>Show my attendance and assessment scores</b> to employers alongside my certificates. <span className="text-muted">Your certificates always show.</span></span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} aria-busy={pending}>{pending ? 'Saving…' : 'Save Passport'}</Button>
        {state.message && <span role="status" className={cx('text-sm font-semibold', state.ok ? 'text-teal-700' : 'text-danger')}>{state.ok ? '✓ ' : ''}{state.message}</span>}
      </div>
    </form>
  );
}
