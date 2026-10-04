// A static picture of the hub workspace for the landing page, built from the product's own tokens so
// it stays sharp at any size and costs nothing to load. Decorative: hidden from assistive tech.
import { Check, Inbox, LayoutGrid, Megaphone, Users } from 'lucide-react';

const ROWS = [
  { name: 'Aisha Musa', track: 'Software Development', ref: 'KIR-26-6YNHG', score: 92, status: 'Offered', tone: 'bg-amber-50 text-amber-800 border-amber-800/15' },
  { name: 'Ibrahim Sani', track: 'Data Analysis', ref: 'KIR-26-2PQ7M', score: 86, status: 'Shortlisted', tone: 'bg-violet-50 text-violet border-violet/15', picked: true },
  { name: 'Fatima Bello', track: 'UI/UX Design', ref: 'KIR-26-J4S8E', score: 78, status: 'Shortlisted', tone: 'bg-violet-50 text-violet border-violet/15', picked: true },
  { name: 'Umar Lawal', track: 'Digital Marketing', ref: 'KIR-26-4JQX6', score: 64, status: 'Under review', tone: 'bg-blue-50 text-blue-600 border-blue/15' },
  { name: 'Khadija Ahmed', track: 'Software Development', ref: 'KIR-26-SKEF3', score: null, status: 'Submitted', tone: 'bg-hover text-ink-2 border-line' },
];

const NAV = [[LayoutGrid, 'Overview', false], [Inbox, 'Applications', true], [Users, 'Cohorts', false], [Megaphone, 'Programmes', false]] as const;

const score = (s: number | null) => (s === null ? 'text-subtle' : s >= 70 ? 'text-teal-700' : 'text-amber-800');

export function ProductPreview() {
  return (
    <div aria-hidden className="select-none overflow-hidden rounded-xl border border-line bg-white text-left shadow-[0_1px_2px_rgba(16,24,40,0.04),0_40px_80px_-24px_rgba(16,24,40,0.22)]">
      {/* Window bar */}
      <div className="flex h-10 items-center gap-3 border-b border-line bg-canvas px-4">
        <span className="flex gap-1.5"><i className="size-2.5 rounded-full bg-line-strong" /><i className="size-2.5 rounded-full bg-line-strong" /><i className="size-2.5 rounded-full bg-line-strong" /></span>
        <span className="mx-auto truncate rounded-md border border-line bg-white px-3 py-0.5 font-mono text-[11px] text-muted">kirkira.talentral.ng/dashboard</span>
        <span className="w-12 max-sm:hidden" />
      </div>
      <div className="grid md:grid-cols-[184px_minmax(0,1fr)]">
        {/* Sidebar */}
        <div className="hidden border-r border-line p-3 md:block">
          <div className="mb-3 flex items-center gap-2 p-1">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-ink text-[11px] font-semibold text-white">K</span>
            <span className="truncate text-[12px] font-semibold">Kirkira Innovation Hub</span>
          </div>
          {NAV.map(([Icon, label, on]) => (
            <div key={label} className={`flex h-7 items-center gap-2 rounded-md px-2 text-[12px] ${on ? 'bg-hover font-medium text-ink' : 'text-ink-2'}`}>
              <Icon className={`size-3.5 ${on ? 'text-ink' : 'text-subtle'}`} strokeWidth={1.75} />{label}
            </div>
          ))}
        </div>
        {/* Applications */}
        <div className="min-w-0">
          <div className="flex items-end justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
            <div className="min-w-0">
              <p className="truncate text-[11px] text-muted">iDICE Centre of Excellence · Cohort 1</p>
              <p className="text-[15px] font-semibold tracking-[-0.01em]">Applications</p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <span className="hidden rounded-md border border-line-strong px-2 py-1 text-[11px] font-medium text-ink-2 sm:inline">Highest score</span>
              <span className="rounded-md bg-blue px-2 py-1 text-[11px] font-medium text-white">Shortlist 2</span>
            </div>
          </div>
          <div className="grid grid-cols-[14px_minmax(0,1fr)_44px] items-center gap-3 border-y border-line bg-canvas/70 px-4 py-1.5 text-[10.5px] font-medium text-muted sm:grid-cols-[14px_minmax(0,1fr)_52px_92px] sm:px-5">
            <span /><span>Applicant</span><span className="text-right">Score</span><span className="hidden sm:block">Status</span>
          </div>
          <ul className="divide-y divide-line">
            {ROWS.map((r) => (
              <li key={r.name} className={`grid grid-cols-[14px_minmax(0,1fr)_44px] items-center gap-3 px-4 py-2.5 sm:grid-cols-[14px_minmax(0,1fr)_52px_92px] sm:px-5 ${r.picked ? 'bg-blue-50/50' : ''}`}>
                <span className={`flex size-3.5 items-center justify-center rounded-[4px] border ${r.picked ? 'border-blue bg-blue text-white' : 'border-line-strong bg-white'}`}>{r.picked && <Check className="size-2.5" strokeWidth={3} />}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-medium">{r.name}</span>
                  <span className="block truncate text-[11px] text-muted">{r.track} · <span className="font-mono">{r.ref}</span></span>
                </span>
                <span className={`text-right text-[12.5px] font-semibold tabular-nums ${score(r.score)}`}>{r.score === null ? '–' : `${r.score}%`}</span>
                <span className="hidden sm:block"><span className={`inline-flex rounded-md border px-1.5 py-px text-[10.5px] font-medium ${r.tone}`}>{r.status}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
