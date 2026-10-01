// How one required skill stands for the person looking: verified, proven in graded work, listed by
// them, or not yet shown. Colour plus an icon and words, never colour alone.
import type { SkillStatus } from '@talentral/domain';
import { cx } from './ui';

type Lang = 'en' | 'ha';
const STYLE: Record<SkillStatus, { chip: string; icon: string; en: string; ha: string }> = {
  verified: { chip: 'border-teal-700/25 bg-teal-50 text-teal-700', icon: '✓✓', en: 'Verified', ha: 'An tabbatar' },
  platform: { chip: 'border-blue/25 bg-blue-50 text-blue-600', icon: '✓', en: 'Proven in graded work', ha: 'An nuna a aikin da aka duba' },
  self: { chip: 'border-line bg-white text-ink', icon: '•', en: 'On your Passport', ha: 'A kan Fasfonka' },
  missing: { chip: 'border-dashed border-line bg-canvas text-muted', icon: '○', en: 'Not shown yet', ha: 'Ba a nuna ba tukuna' },
};

export function SkillChip({ skill, status, lang = 'en' }: { skill: string; status: SkillStatus; lang?: Lang }) {
  const s = STYLE[status];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', s.chip)} title={lang === 'ha' ? s.ha : s.en}>
      <span aria-hidden>{s.icon}</span>{skill}<span className="sr-only">: {lang === 'ha' ? s.ha : s.en}</span>
    </span>
  );
}

export function SkillLegend({ lang = 'en' }: { lang?: Lang }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label={lang === 'ha' ? 'Ma’anar alamu' : 'What the marks mean'}>
      {(['verified', 'platform', 'self', 'missing'] as SkillStatus[]).map((k) => (
        <li key={k} className="flex items-center gap-1.5"><span aria-hidden className="font-bold">{STYLE[k].icon}</span>{lang === 'ha' ? STYLE[k].ha : STYLE[k].en}</li>
      ))}
    </ul>
  );
}
