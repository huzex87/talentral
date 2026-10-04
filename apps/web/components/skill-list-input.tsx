'use client';
// Required skills for a role: typed freely, or picked from the shared skills list by track, so
// roles and Passports speak the same language and matching works.
import { useState } from 'react';
import { cx } from './ui';

export function SkillListInput({ id, name, suggestions, defaultValue = '', invalid }: {
  id: string; name: string; suggestions: { name: string; track: string }[]; defaultValue?: string; invalid?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const tracks = [...new Set(suggestions.map((s) => s.track))];
  const [track, setTrack] = useState(tracks[0] ?? '');
  const chosen = value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const add = (skill: string) => setValue((v) => (v.trim() ? `${v.replace(/[,\s]+$/, '')}, ${skill}` : skill));
  return (
    <div className="space-y-2">
      <input id={id} name={name} value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={invalid || undefined}
        placeholder="Social media management, Canva, Content writing"
        className="w-full rounded-[var(--radius-control)] border border-line bg-white px-3.5 py-2.5 text-[15px] outline-none transition focus:border-blue focus:ring-2 focus:ring-blue/15" />
      {tracks.length > 0 && (
        <div className="rounded-xl border border-line bg-canvas/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-muted">From the skills list</span>
            <select value={track} onChange={(e) => setTrack(e.target.value)} aria-label="Skills track" className="rounded-lg border border-line bg-white px-2 py-1 text-sm">
              {tracks.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.filter((s) => s.track === track).map((s) => {
              const on = chosen.includes(s.name.toLowerCase());
              return (
                <button key={s.name} type="button" disabled={on} onClick={() => add(s.name)}
                  className={cx('rounded-full border px-2.5 py-1 text-xs font-semibold transition', on ? 'border-blue bg-blue-50 text-blue-600' : 'border-dashed border-line bg-white text-muted hover:border-blue/40 hover:text-blue')}>
                  {on ? '✓ ' : '+ '}{s.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
