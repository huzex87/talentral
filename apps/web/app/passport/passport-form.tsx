'use client';
import { useActionState, useState, type KeyboardEvent } from 'react';
import { AVAILABILITY, AVAILABILITY_HA, JOB_TYPES, JOB_TYPES_HA, LANGUAGES, NIGERIAN_STATES, WORK_MODES, WORK_MODES_HA } from '@talentral/domain';
import { Alert, Button, Field, Input, Select, Textarea, cx } from '@/components/ui';
import { keepValues } from '@/lib/keep-values';
import type { Passport } from '@/lib/passport-data';
import { savePassport, type PassportState } from './actions';

type T = (en: string, ha: string) => string;

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

function SkillInput({ initial, error, suggestions, t }: { initial: string[]; error?: string; suggestions: string[]; t: T }) {
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
    <Field label={t('Skills', 'Ƙwarewa')} htmlFor="skill-input" required error={error}
      hint={t('Type a skill and press Enter. Add at least 3. These show as self-declared; your certificates show as platform-evidenced.',
        'Rubuta ƙwarewa ka danna Enter. Ƙara aƙalla 3. Waɗannan za su bayyana a matsayin abin da ka faɗa da kanka; takardun shaidarka kuwa shaidar Talentral ce.')}>
      <input type="hidden" name="skills" value={skills.join('\n')} />
      <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-[var(--radius-control)] border border-line bg-white px-2 py-1.5 focus-within:border-blue focus-within:ring-2 focus-within:ring-blue/15">
        {skills.map((s) => (
          <span key={s} className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-2.5 pr-1 text-sm font-semibold text-blue-600">
            {s}
            <button type="button" onClick={() => setSkills(skills.filter((x) => x !== s))} aria-label={t(`Remove ${s}`, `Cire ${s}`)} className="flex size-5 items-center justify-center rounded-full hover:bg-blue/15">×</button>
          </span>
        ))}
        <input id="skill-input" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={() => draft && add(draft)}
          placeholder={skills.length ? t('Add another', 'Ƙara wani') : t('e.g. Social media management', 'misali: Social media management')} className="min-w-40 flex-1 bg-transparent px-1 py-1 text-[15px] outline-none" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(suggestions.length ? suggestions : SUGGESTED).filter((s) => !skills.some((x) => x.toLowerCase() === s.toLowerCase())).slice(0, 8).map((s) => (
          <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-dashed border-line px-2.5 py-1 text-xs font-semibold text-muted hover:border-blue/40 hover:text-blue">+ {s}</button>
        ))}
      </div>
    </Field>
  );
}

export function PassportForm({ p, suggestions = [], lang = 'en' }: { p: Omit<Passport, 'user_id'>; suggestions?: string[]; lang?: 'en' | 'ha' }) {
  const [state, action, pending] = useActionState<PassportState, FormData>(savePassport, {});
  const [links, setLinks] = useState(p.links.length ? p.links : [{ label: '', url: '' }]);
  const e = state.errors ?? {};
  const ha = lang === 'ha';
  const t: T = (en, h) => (ha ? h : en);

  return (
    <form onSubmit={keepValues(action)} className="space-y-6">
      {state.message && !state.ok && <Alert tone="danger">{state.message}</Alert>}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label={t('Headline', 'Taken aiki')} htmlFor="headline" required error={e.headline} hint={t('One line about the work you do or want to do.', 'Jimla ɗaya game da aikin da kake yi ko kake so ka yi.')}>
            <Input id="headline" name="headline" maxLength={120} defaultValue={p.headline ?? ''} placeholder={t('Digital marketer and content creator', 'Mai tallace-tallace ta intanet')} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t('About you', 'Game da kai')} htmlFor="bio" error={e.bio} hint={t('What you are good at, what you have built, and what you are looking for.', 'Abin da ka ƙware a kai, abin da ka gina, da abin da kake nema.')}>
            <Textarea id="bio" name="bio" rows={5} maxLength={1500} defaultValue={p.bio ?? ''} />
          </Field>
        </div>
        <Field label={t('State', 'Jiha')} htmlFor="state" required error={e.state}>
          <Select id="state" name="state" defaultValue={p.state ?? ''}>
            <option value="">{t('Choose a state', 'Zaɓi jiha')}</option>
            {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label={t('Town or city', 'Gari ko birni')} htmlFor="city" error={e.city} hint={t('Only you and talent officers see this.', 'Kai da jami’an Talentral kaɗai ke ganin wannan.')}>
          <Input id="city" name="city" maxLength={80} defaultValue={p.city ?? ''} placeholder="Katsina" />
        </Field>
        <div className="sm:col-span-2"><SkillInput initial={p.skills} error={e.skills} suggestions={suggestions} t={t} /></div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t('How do you want to work?', 'Yaya kake so ka yi aiki?')} <span className="text-danger">*</span></legend>
        <Chips name="work_modes" options={Object.keys(WORK_MODES)} labels={ha ? WORK_MODES_HA : WORK_MODES} selected={p.work_modes} />
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t('Open to', 'Irin aikin da kake so')}</legend>
        <Chips name="job_types" options={Object.keys(JOB_TYPES)} labels={ha ? JOB_TYPES_HA : JOB_TYPES} selected={p.job_types} />
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('Availability', 'Lokacin da za ka fara')} htmlFor="availability" error={e.availability}>
          <Select id="availability" name="availability" defaultValue={p.availability}>
            {Object.entries(ha ? AVAILABILITY_HA : AVAILABILITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t('Languages you work in', 'Harsunan da kake aiki da su')}</legend>
        <Chips name="languages" options={LANGUAGES} selected={p.languages} />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">{t('Work samples and links', 'Misalan aiki da hanyoyi')}</legend>
        <p className="text-sm text-muted">{t('Portfolio, GitHub, LinkedIn, a website you built or a Google Drive folder of your work.', 'Portfolio, GitHub, LinkedIn, shafin da ka gina ko fayil ɗin Google Drive na ayyukanka.')}</p>
        {e.links && <p className="text-sm font-semibold text-danger">{e.links}</p>}
        {links.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
            <Input name="link_label" aria-label={t(`Link ${i + 1} name`, `Sunan hanya ta ${i + 1}`)} defaultValue={l.label} placeholder="Portfolio" maxLength={40} />
            <Input name="link_url" aria-label={t(`Link ${i + 1} address`, `Adireshin hanya ta ${i + 1}`)} defaultValue={l.url} placeholder="https://" type="url" inputMode="url" />
            <button type="button" onClick={() => setLinks(links.filter((_, j) => j !== i))} className="rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-canvas hover:text-danger">{t('Remove', 'Cire')}</button>
          </div>
        ))}
        {links.length < 6 && <button type="button" onClick={() => setLinks([...links, { label: '', url: '' }])} className="text-sm font-semibold text-blue hover:underline">+ {t('Add a link', 'Ƙara hanya')}</button>}
      </fieldset>

      <label className={cx('flex items-start gap-3 rounded-xl border border-line bg-canvas/60 p-4 text-sm')}>
        <input type="checkbox" name="show_scores" defaultChecked={p.show_scores} className="mt-0.5 size-4 accent-[var(--color-blue)]" />
        <span>
          <b>{t('Show my attendance and assessment scores', 'Nuna halartar ajina da makin jarrabawata')}</b> {t('to employers alongside my certificates.', 'ga masu ɗaukar aiki tare da takardun shaidata.')}{' '}
          <span className="text-muted">{t('Your certificates always show.', 'Takardun shaidarka koyaushe suna bayyana.')}</span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} aria-busy={pending}>{pending ? t('Saving…', 'Ana ajiyewa…') : t('Save Passport', 'Ajiye Fasfo')}</Button>
        {state.message && <span role="status" className={cx('text-sm font-semibold', state.ok ? 'text-teal-700' : 'text-danger')}>{state.ok ? '✓ ' : ''}{state.message}</span>}
      </div>
    </form>
  );
}
