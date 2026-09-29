// How a Passport reads to someone else: a talent officer, an employer through a shortlist link, or
// the learner previewing it. Shows only what the learner has chosen to share, and labels every
// claim as self-declared, platform-evidenced or verified.
import Link from 'next/link';
import { AVAILABILITY, READINESS, WORK_MODES, type Readiness, type WorkAvailability } from '@talentral/domain';
import { formatDate } from '@/lib/format';
import { cx } from './ui';

export interface TalentCredential { serial: string; programme: string; hub: string; track: string | null; completed_on: string | Date; attendance: number | string | null; score: number | string | null }
export interface TalentCardData {
  name: string; headline: string | null; bio: string | null; state: string | null; languages: string[]; skills: string[];
  availability: WorkAvailability; work_modes: string[]; links: { label: string; url: string }[];
  readiness: Readiness; credentials: TalentCredential[];
}

const READINESS_STYLE: Record<Readiness, string> = {
  not_assessed: 'bg-canvas text-muted border-line',
  developing: 'bg-amber-50 text-amber-800 border-amber-800/20',
  ready: 'bg-blue-50 text-blue-600 border-blue/20',
  ready_verified: 'bg-teal-50 text-teal-700 border-teal-700/20',
};

export function ReadinessBadge({ level, className }: { level: Readiness; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold', READINESS_STYLE[level], className)}>
      <span aria-hidden className={cx('size-1.5 rounded-full', level === 'ready_verified' ? 'bg-teal-700' : level === 'ready' ? 'bg-blue' : level === 'developing' ? 'bg-amber-800' : 'bg-muted')} />
      {READINESS[level]}
    </span>
  );
}

export function EvidenceLabel({ kind }: { kind: 'self' | 'platform' | 'verified' }) {
  const [text, style] = kind === 'verified' ? ['Verified', 'text-teal-700'] : kind === 'platform' ? ['Platform-evidenced', 'text-blue'] : ['Self-declared', 'text-muted'];
  return <span className={cx('text-[11px] font-bold uppercase tracking-[0.08em]', style)}>{text}</span>;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

export function TalentCard({ t, footer }: { t: TalentCardData; footer?: React.ReactNode }) {
  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[0_1px_2px_rgba(16,23,51,0.04)]">
      <div className="h-1 bg-[linear-gradient(90deg,#7C3AED,#2E5BFF,#14B8A6)]" />
      <div className="p-5 sm:p-6">
        <header className="flex items-start gap-4">
          <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#EDE9FE,#DBEAFE)] font-display text-lg font-semibold text-violet">{initials(t.name)}</span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-xl font-semibold leading-tight">{t.name}</h3>
            {t.headline && <p className="mt-0.5 text-[15px] text-ink/80">{t.headline}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <ReadinessBadge level={t.readiness} />
              <span>{[t.state, AVAILABILITY[t.availability], t.work_modes.map((m) => WORK_MODES[m as keyof typeof WORK_MODES] ?? m).join(', ')].filter(Boolean).join(' · ')}</span>
            </div>
          </div>
        </header>

        {t.bio && <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed">{t.bio}</p>}

        {t.credentials.length > 0 && (
          <section className="mt-5">
            <div className="flex items-baseline justify-between gap-2"><h4 className="text-sm font-semibold">Credentials</h4><EvidenceLabel kind="platform" /></div>
            <ul className="mt-2 space-y-2">
              {t.credentials.map((c) => (
                <li key={c.serial} className="rounded-xl border border-line bg-canvas/60 p-3 text-sm">
                  <p className="font-semibold">{c.programme}{c.track ? ` · ${c.track}` : ''}</p>
                  <p className="text-muted">{c.hub} · completed {formatDate(c.completed_on)}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {c.attendance !== null && <span><b>{Number(c.attendance)}%</b> <span className="text-muted">attendance</span></span>}
                    {c.score !== null && <span><b>{Number(c.score)}%</b> <span className="text-muted">assessed score</span></span>}
                    <Link href={`/verify/${c.serial}`} target="_blank" className="font-mono text-xs font-semibold text-blue hover:underline">{c.serial} ↗</Link>
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {t.skills.length > 0 && (
          <section className="mt-5">
            <div className="flex items-baseline justify-between gap-2"><h4 className="text-sm font-semibold">Skills</h4><EvidenceLabel kind="self" /></div>
            <ul className="mt-2 flex flex-wrap gap-1.5">{t.skills.map((s) => <li key={s} className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold">{s}</li>)}</ul>
          </section>
        )}

        {(t.languages.length > 0 || t.links.length > 0) && (
          <section className="mt-5 grid gap-4 sm:grid-cols-2">
            {t.languages.length > 0 && <div><h4 className="text-sm font-semibold">Languages</h4><p className="mt-1 text-sm text-muted">{t.languages.join(', ')}</p></div>}
            {t.links.length > 0 && (
              <div><h4 className="text-sm font-semibold">Work and links</h4>
                <ul className="mt-1 space-y-0.5 text-sm">{t.links.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-blue hover:underline">{l.label} ↗</a></li>)}</ul>
              </div>
            )}
          </section>
        )}
        {footer && <div className="mt-5 border-t border-line pt-4">{footer}</div>}
      </div>
    </article>
  );
}
