// A decorative, static picture of the hub dashboard for the landing page, built from the same
// tokens as the real product so it stays sharp at any size and costs nothing to load.

const ROWS = [
  { initials: 'AM', name: 'Aisha Musa', track: 'Software Development', score: 92, status: 'Offered', tone: 'bg-amber-50 text-amber-800' },
  { initials: 'IS', name: 'Ibrahim Sani', track: 'Data Analysis', score: 86, status: 'Shortlisted', tone: 'bg-violet-50 text-violet' },
  { initials: 'FB', name: 'Fatima Bello', track: 'UI/UX Design', score: 78, status: 'Shortlisted', tone: 'bg-violet-50 text-violet' },
  { initials: 'UL', name: 'Umar Lawal', track: 'Digital Marketing', score: 64, status: 'Under review', tone: 'bg-blue-50 text-blue' },
  { initials: 'KA', name: 'Khadija Ahmed', track: 'Software Development', score: null, status: 'Submitted', tone: 'bg-canvas text-muted' },
];

const band = (s: number | null) => (s === null ? 'bg-canvas text-muted' : s >= 70 ? 'bg-teal-50 text-teal-700' : 'bg-amber-50 text-amber-800');
const AVATAR = ['bg-violet', 'bg-blue', 'bg-teal-700', 'bg-[#5B49F2]', 'bg-ink'];

export function ProductPreview() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[560px] select-none">
      <div className="absolute -inset-10 rounded-[40px] bg-[radial-gradient(closest-side,rgba(46,91,255,0.35),transparent)] blur-2xl" />

      {/* Applications list */}
      <div className="relative rounded-2xl border border-white/10 bg-white text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet">iDICE Cohort 1</p>
            <p className="font-display text-[15px] font-semibold">Applications</p>
          </div>
          <div className="flex gap-1.5">
            <span className="rounded-md border border-line px-2 py-1 text-[10px] font-semibold text-muted">Highest score</span>
            <span className="rounded-md bg-blue px-2 py-1 text-[10px] font-semibold text-white">Shortlist 2</span>
          </div>
        </div>
        <ul className="divide-y divide-line">
          {ROWS.map((r, i) => (
            <li key={r.name} className="flex items-center gap-3 px-5 py-2.5">
              <span className={`size-4 shrink-0 rounded border ${i === 1 || i === 2 ? 'border-blue bg-blue' : 'border-line'}`} />
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${AVATAR[i]}`}>{r.initials}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{r.name}</span>
                <span className="block truncate text-[11px] text-muted">{r.track}</span>
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${band(r.score)}`}>{r.score === null ? 'Not scored' : `${r.score}%`}</span>
              <span className={`hidden rounded-full px-2 py-0.5 text-[11px] font-semibold sm:inline ${r.tone}`}>{r.status}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Milestone report card */}
      <div className="absolute -bottom-28 -left-6 hidden w-56 rounded-xl border border-line bg-white p-4 text-ink shadow-xl sm:block lg:-left-12">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet">Milestone report</p>
        <p className="mt-1 font-display text-2xl font-semibold">52% <span className="text-xs font-normal text-muted">women selected</span></p>
        <div className="mt-3 space-y-1.5">
          {[['Applied', 100, 'bg-mist'], ['Shortlisted', 46, 'bg-violet'], ['Selected', 24, 'bg-teal']].map(([l, w, c]) => (
            <div key={l as string} className="flex items-center gap-2 text-[10px] text-muted">
              <span className="w-16">{l}</span>
              <span className="h-1.5 flex-1 rounded-full bg-canvas"><span className={`block h-1.5 rounded-full ${c}`} style={{ width: `${w}%` }} /></span>
            </div>
          ))}
        </div>
      </div>

      {/* Notification toast */}
      <div className="absolute -right-4 -top-16 hidden items-center gap-2.5 rounded-xl border border-line bg-white px-3.5 py-2.5 text-ink shadow-xl sm:flex lg:-right-10">
        <span className="flex size-7 items-center justify-center rounded-full bg-teal text-sm text-white">✓</span>
        <span>
          <span className="block text-[12px] font-semibold">24 moved to Shortlisted</span>
          <span className="block text-[11px] text-muted">24 emailed · 21 texted</span>
        </span>
      </div>
    </div>
  );
}
