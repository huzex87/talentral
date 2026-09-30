import type { Metadata } from 'next';
import { withUser } from '@talentral/db';
import { JOB_TYPES, WORK_MODES, readinessLevel, type WorkAvailability, type WorkMode } from '@talentral/domain';
import { TalentralLogo } from '@/components/logo';
import { TalentCard, type TalentCredential, type TalentEvidence } from '@/components/talent-card';
import { Badge } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { hashToken } from '@/lib/tokens';

// Shortlists name people: keep them out of search engines and caches.
export const metadata: Metadata = { title: 'Candidate shortlist', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Shortlist = {
  expires_at: string;
  role: { title: string; description: string | null; skills: string[]; work_mode: WorkMode; job_type: keyof typeof JOB_TYPES; state: string | null; employer: string };
  candidates: { name: string; headline: string | null; bio: string | null; state: string | null; languages: string[]; skills: string[];
    availability: WorkAvailability; work_modes: string[]; links: { label: string; url: string }[]; verified: boolean; credentials: TalentCredential[]; evidence: TalentEvidence[] }[];
};

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="min-h-dvh">
      <div className="brand-rule" />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-8 flex items-center justify-between gap-3"><TalentralLogo height={26} href={null} /><span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Talent shortlist</span></div>
        {children}
      </div>
    </main>
  );
}

export default async function SharedShortlist({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [row] = token.length >= 20 && token.length <= 100
    ? await withUser(null, (tx) => tx<{ s: Shortlist | null }[]>`select app.open_shortlist(${hashToken(token)}) as s`)
    : [];
  const s = row?.s;
  if (!s) {
    return (
      <Frame>
        <div className="rounded-[var(--radius-card)] border border-line bg-white p-8 text-center shadow-[var(--shadow-card)]">
          <h1 className="text-2xl font-semibold">This link is no longer available</h1>
          <p className="mx-auto mt-2 max-w-md text-muted">Shortlist links expire after 14 days or can be withdrawn. Ask your Talentral talent officer for a new one.</p>
        </div>
      </Frame>
    );
  }
  const r = s.role;
  return (
    <Frame>
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet">For {r.employer}</p>
        <h1 className="mt-1 text-3xl font-semibold leading-tight">{r.title}</h1>
        <p className="mt-1 text-[15px] text-muted">{WORK_MODES[r.work_mode]} · {JOB_TYPES[r.job_type]}{r.state ? ` · ${r.state}` : ''} · {s.candidates.length} {s.candidates.length === 1 ? 'candidate' : 'candidates'}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">{r.skills.map((k) => <Badge key={k} tone="blue">{k}</Badge>)}</div>
      </header>
      <div className="mb-6 rounded-[var(--radius-control)] border border-line bg-white p-4 text-sm leading-relaxed text-muted">
        Every candidate here asked to be considered for this role. <b className="text-ink">Platform-evidenced</b> credentials were earned on Talentral and can be checked with the certificate number.
        <b className="text-ink"> Self-declared</b> skills come from the candidate. To arrange interviews, reply to your Talentral talent officer. This link expires on {formatDate(s.expires_at)}.
      </div>
      {s.candidates.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-line bg-white p-6 text-center text-muted">No candidates are available on this shortlist right now.</p>
      ) : (
        <div className="space-y-5">
          {s.candidates.map((c, i) => (
            <TalentCard key={i} t={{ ...c, readiness: readinessLevel({ enrolments: 1, certificates: c.credentials.length, verified: c.verified }) }} />
          ))}
        </div>
      )}
      <p className="mt-8 text-center text-xs text-muted">Shared through Talentral. Candidate information is confidential: do not forward this link.</p>
    </Frame>
  );
}
