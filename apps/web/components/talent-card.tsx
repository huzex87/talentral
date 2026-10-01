// How a Passport reads to someone else: a talent officer, an employer through a shortlist link, or
// the learner previewing it. Shows only what the learner has chosen to share, and labels every
// claim as self-declared, platform-evidenced or verified.
import Link from 'next/link';
import { AVAILABILITY, READINESS, READINESS_HA, WORK_MODES, portfolioKind, type Readiness, type WorkAvailability } from '@talentral/domain';
import { formatDate } from '@/lib/format';
import { cx } from './ui';

export interface TalentCredential { serial: string; programme: string; hub: string; track: string | null; completed_on: string | Date; attendance: number | string | null; score: number | string | null }
export interface TalentEvidence { skill: string; assessment: string; programme: string; percent: number | string | null }
export interface PortfolioView {
  id: string; title: string; description: string | null; url: string | null; skills: string[]; submission_id: string | null; verified_at: Date | null;
  lesson_title: string | null; course_title: string | null; hub_name: string | null; score: number | string | null;
}
export interface TalentCardData {
  name: string; headline: string | null; bio: string | null; state: string | null; languages: string[]; skills: string[];
  availability: WorkAvailability; work_modes: string[]; links: { label: string; url: string }[];
  readiness: Readiness; credentials: TalentCredential[]; evidence?: TalentEvidence[];
  availableFrom?: string | null; relocate?: boolean; targetRoles?: string[]; portfolio?: PortfolioView[];
}

// One entry per skill, keeping the strongest piece of graded work behind it.
export function bestEvidence(rows: TalentEvidence[]): TalentEvidence[] {
  const best = new Map<string, TalentEvidence>();
  for (const r of rows) {
    const cur = best.get(r.skill);
    if (!cur || Number(r.percent ?? 0) > Number(cur.percent ?? 0)) best.set(r.skill, r);
  }
  return [...best.values()].sort((a, b) => a.skill.localeCompare(b.skill));
}

const READINESS_STYLE: Record<Readiness, string> = {
  not_assessed: 'bg-canvas text-muted border-line',
  developing: 'bg-amber-50 text-amber-800 border-amber-800/20',
  ready: 'bg-blue-50 text-blue-600 border-blue/20',
  ready_verified: 'bg-teal-50 text-teal-700 border-teal-700/20',
};

export function ReadinessBadge({ level, className, lang = 'en' }: { level: Readiness; className?: string; lang?: 'en' | 'ha' }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold', READINESS_STYLE[level], className)}>
      <span aria-hidden className={cx('size-1.5 rounded-full', level === 'ready_verified' ? 'bg-teal-700' : level === 'ready' ? 'bg-blue' : level === 'developing' ? 'bg-amber-800' : 'bg-muted')} />
      {lang === 'ha' ? READINESS_HA[level] : READINESS[level]}
    </span>
  );
}

export function EvidenceLabel({ kind, lang = 'en' }: { kind: 'self' | 'platform' | 'verified'; lang?: 'en' | 'ha' }) {
  const ha = lang === 'ha';
  const [text, style] = kind === 'verified' ? [ha ? 'An tabbatar' : 'Verified', 'text-teal-700']
    : kind === 'platform' ? [ha ? 'Shaidar Talentral' : 'Platform-evidenced', 'text-blue'] : [ha ? 'Da bakinsa' : 'Self-declared', 'text-muted'];
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
              <span>{[t.state, t.availableFrom && t.availability !== 'not_looking' ? `Available from ${formatDate(t.availableFrom)}` : AVAILABILITY[t.availability],
                t.work_modes.map((m) => WORK_MODES[m as keyof typeof WORK_MODES] ?? m).join(', '), t.relocate ? 'Open to relocating' : null].filter(Boolean).join(' · ')}</span>
            </div>
          </div>
        </header>

        {t.targetRoles && t.targetRoles.length > 0 && <p className="mt-3 text-sm"><span className="font-semibold">Looking for:</span> {t.targetRoles.join(', ')}</p>}
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

        {t.evidence && t.evidence.length > 0 && (
          <section className="mt-5">
            <div className="flex items-baseline justify-between gap-2"><h4 className="text-sm font-semibold">Skills shown in graded work</h4><EvidenceLabel kind="platform" /></div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {bestEvidence(t.evidence).map((e) => (
                <li key={e.skill} title={`${e.assessment}, ${e.programme}`} className="inline-flex items-center gap-1.5 rounded-full border border-blue/20 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600">
                  <span aria-hidden>✓</span>{e.skill}{e.percent !== null && <span className="font-normal opacity-80">{Number(e.percent)}%</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {t.portfolio && t.portfolio.length > 0 && (
          <section className="mt-5">
            <h4 className="text-sm font-semibold">Portfolio</h4>
            <ul className="mt-2 space-y-2">
              {t.portfolio.map((p) => {
                const kind = portfolioKind(p);
                return (
                  <li key={p.id} className="rounded-xl border border-line p-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold">{p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="text-blue hover:underline">{p.title} ↗</a> : p.title}</p>
                      <EvidenceLabel kind={kind} />
                    </div>
                    {p.description && <p className="mt-1 whitespace-pre-line text-muted">{p.description}</p>}
                    {p.lesson_title && <p className="mt-1 text-xs text-muted">Graded work: {p.lesson_title}{p.course_title ? `, ${p.course_title}` : ''}{p.hub_name ? ` (${p.hub_name})` : ''}{p.score !== null ? ` · ${Number(p.score)}%` : ''}</p>}
                    {p.verified_at && <p className="mt-1 text-xs font-semibold text-teal-700">Checked by a Talentral talent officer on {formatDate(p.verified_at)}</p>}
                    {p.skills.length > 0 && <ul className="mt-2 flex flex-wrap gap-1">{p.skills.map((s) => <li key={s} className="rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold">{s}</li>)}</ul>}
                  </li>
                );
              })}
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
        <p className="mt-5 border-t border-line pt-3 text-xs leading-relaxed text-muted">
          <b className="text-teal-700">Verified</b>: checked by a Talentral talent officer or trusted issuer. <b className="text-blue">Platform-evidenced</b>: earned in graded work on Talentral. <b>Self-declared</b>: added by the person. Talentral never implies everything is independently verified.
        </p>
        {footer && <div className="mt-5 border-t border-line pt-4">{footer}</div>}
      </div>
    </article>
  );
}
