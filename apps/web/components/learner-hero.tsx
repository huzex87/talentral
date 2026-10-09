// The top of a learner's home: how far through their course they are, how long until the next
// class and how many days in a row they have learned. Every figure has a text equivalent, and
// the countdown is computed on the server so it reads the same offline from the cached page.
import { CalendarClock, Flame } from 'lucide-react';
import { cx } from './ui';

type T = (en: string, ha: string) => string;

export function ProgressRing({ pct, size = 88, stroke = 8, label }: { pct: number; size?: number; stroke?: number; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E6EAF2" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#ring)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, pct)) / 100)} />
        <defs><linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2E5BFF" /><stop offset="1" stopColor="#14B8A6" /></linearGradient></defs>
      </svg>
      <span className="absolute inset-0 grid place-items-center font-display text-xl font-semibold tabular-nums text-ink" aria-hidden>{pct}%</span>
    </div>
  );
}

// "in 2 days", "in 3 hours", "in 25 minutes", in English or Hausa.
export function countdown(to: Date, now: number, t: T): string {
  const mins = Math.max(0, Math.round((to.getTime() - now) / 60_000));
  if (mins < 60) return t(`in ${mins} min`, `cikin minti ${mins}`);
  const hours = Math.round(mins / 60);
  if (hours < 24) return t(`in ${hours} ${hours === 1 ? 'hour' : 'hours'}`, `cikin awa ${hours}`);
  const days = Math.round(hours / 24);
  return t(`in ${days} ${days === 1 ? 'day' : 'days'}`, `cikin kwana ${days}`);
}

export function LearnerHero({ pct, done, total, next, streak, week, t }: {
  pct: number; done: number; total: number; streak: number; week: number; t: T;
  next: { title: string; when: string; inText: string; cohort: string } | null;
}) {
  return (
    <section className="mb-6 grid grid-cols-2 overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)] sm:grid-cols-3" aria-label={t('Your progress', 'Ci gabanka')}>
      <div className="col-span-2 flex items-center gap-4 p-5 sm:col-span-1">
        <ProgressRing pct={pct} label={t(`${pct}% of your course done`, `Ka kammala ${pct}% na kwas ɗinka`)} />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted">{t('Course progress', 'Ci gaban kwas')}</p>
          <p className="mt-0.5 font-display text-lg font-semibold leading-tight">{done} {t('of', 'cikin')} {total} {t('lessons', 'darussa')}</p>
          <p className="mt-0.5 text-[13px] text-muted">{pct >= 100 ? t('Every open lesson done', 'Duk darussan da ke buɗe an gama') : t('Keep going, one lesson at a time', 'Ci gaba, darasi ɗaya bayan ɗaya')}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 border-t border-line p-4 sm:border-l sm:border-t-0 sm:p-5">
        <span className="hidden size-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue sm:grid" aria-hidden><CalendarClock className="size-6" strokeWidth={1.75} /></span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted">{t('Next class', 'Aji na gaba')}</p>
          {next ? (<>
            <p className="mt-0.5 font-display text-lg font-semibold leading-tight">{next.inText}</p>
            <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{next.title} · {next.when}</p>
          </>) : <p className="mt-0.5 text-sm text-muted">{t('Nothing booked in the next two weeks', 'Babu aji a makonni biyu masu zuwa')}</p>}
        </div>
      </div>
      <div className="flex items-center gap-4 border-l border-t border-line p-4 sm:border-t-0 sm:p-5">
        <span className={cx('hidden size-12 shrink-0 place-items-center rounded-2xl sm:grid', streak ? 'bg-amber-50 text-amber-800' : 'bg-canvas text-subtle')} aria-hidden><Flame className="size-6" strokeWidth={1.75} /></span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted">{t('Learning streak', 'Jerin kwanaki')}</p>
          <p className="mt-0.5 font-display text-lg font-semibold leading-tight">{streak ? t(`${streak} ${streak === 1 ? 'day' : 'days'} in a row`, `Kwana ${streak} a jere`) : t('Start one today', 'Fara yau')}</p>
          <div className="mt-1.5 flex items-center gap-1" role="img" aria-label={t(`Active on ${week} of the last 7 days`, `Ka yi karatu kwana ${week} cikin 7 da suka wuce`)}>
            {Array.from({ length: 7 }, (_, i) => <span key={i} className={cx('h-1.5 w-3 rounded-full sm:w-5', i < week ? 'bg-amber-800/70' : 'bg-hover')} />)}
            <span className="ml-1.5 text-xs text-muted">{week}/7</span>
          </div>
        </div>
      </div>
    </section>
  );
}
