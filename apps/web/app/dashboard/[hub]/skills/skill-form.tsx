'use client';
import { useActionState } from 'react';
import { Alert, Field, Input, Select } from '@/components/ui';
import { SubmitButton } from '@/components/submit-button';
import { addSkill, type SkillState } from './actions';

export function SkillForm({ slug, tracks, platform }: { slug: string; tracks: string[]; platform: { id: string; name: string; track: string }[] }) {
  const [state, action] = useActionState<SkillState, FormData>(addSkill.bind(null, slug), {});
  const e = state.errors ?? {};
  return (
    <form key={state.ok ? state.message : 'form'} action={action} className="grid gap-4 sm:grid-cols-2">
      {state.message && <div className="sm:col-span-2"><Alert tone={state.ok ? 'teal' : 'danger'}>{state.message}</Alert></div>}
      <Field label="Skill name" htmlFor="sk-name" required error={e.name}><Input id="sk-name" name="name" maxLength={60} placeholder="Hausa copywriting" /></Field>
      <Field label="Track" htmlFor="sk-track" required error={e.track} hint="Pick a track or type a new one.">
        <Input id="sk-track" name="track" list="sk-tracks" maxLength={80} placeholder="Digital Marketing" />
        <datalist id="sk-tracks">{tracks.map((t) => <option key={t} value={t} />)}</datalist>
      </Field>
      <Field label="Counts as (platform skill)" htmlFor="sk-map" error={e.maps_to} hint="Evidence for this skill is reported under the platform skill, so employers can compare across hubs.">
        <Select id="sk-map" name="maps_to" defaultValue="">
          <option value="">Not mapped</option>
          {tracks.map((t) => (
            <optgroup key={t} label={t}>{platform.filter((p) => p.track === t).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
          ))}
        </Select>
      </Field>
      <Field label="Description" htmlFor="sk-desc" error={e.description}><Input id="sk-desc" name="description" maxLength={200} placeholder="Writes persuasive social posts in Hausa" /></Field>
      <div className="sm:col-span-2"><SubmitButton pendingLabel="Adding…">Add skill</SubmitButton></div>
    </form>
  );
}
