'use client';
export interface SkillChoice { id: string; name: string; track: string; hub: boolean; suggested: boolean }

// Chips for tagging an assessment with the skills it shows. Skills on the programme's tracks come
// first; the whole taxonomy is one click away.
export function SkillPicker({ skills, chosen = [], legend = 'Skills this assessment shows' }: { skills: SkillChoice[]; chosen?: string[]; legend?: string }) {
  const suggested = skills.filter((s) => s.suggested || chosen.includes(s.id));
  const others = skills.filter((s) => !s.suggested && !chosen.includes(s.id));
  const tracks = [...new Set(others.map((s) => s.track))];
  const chip = (s: SkillChoice) => (
    <label key={s.id} className="cursor-pointer">
      <input type="checkbox" name="skills" value={s.id} defaultChecked={chosen.includes(s.id)} className="peer sr-only" />
      <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold text-muted transition peer-checked:border-violet peer-checked:bg-violet-50 peer-checked:text-violet peer-focus-visible:ring-2 peer-focus-visible:ring-violet/40">
        {s.name}{s.hub && <span className="text-[13px] font-medium text-muted">hub</span>}
      </span>
    </label>
  );
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{legend}</legend>
      <p className="text-sm text-muted">Learners who reach the pass mark get these as platform-evidenced skills on their Passport.</p>
      {suggested.length > 0 && <div className="flex flex-wrap gap-1.5">{suggested.map(chip)}</div>}
      {others.length > 0 && (
        <details className="rounded-xl border border-line bg-canvas/50 px-3 py-2" open={suggested.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold text-muted">{suggested.length ? 'More skills from other tracks' : 'Choose from the skills list'}</summary>
          <div className="mt-3 space-y-3">
            {tracks.map((t) => (
              <div key={t}><p className="mb-1.5 text-[13px] font-medium text-muted">{t}</p><div className="flex flex-wrap gap-1.5">{others.filter((s) => s.track === t).map(chip)}</div></div>
            ))}
          </div>
        </details>
      )}
    </fieldset>
  );
}

