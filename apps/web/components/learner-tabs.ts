import { BookOpen, BriefcaseBusiness, IdCard } from 'lucide-react';

// The learner app's three sections, shared by the server header and the phone tab bar.
export type LearnerSection = 'learn' | 'passport' | 'jobs';

// Each section wears one of the logo's colours: learning blue, Passport violet, jobs teal.
export const SECTION_TONE: Record<LearnerSection, { pill: string; dot: string }> = {
  learn: { pill: 'bg-blue-50 text-blue-600', dot: 'bg-[#7C9BFF]' },
  passport: { pill: 'bg-violet-50 text-violet', dot: 'bg-[#A78BFA]' },
  jobs: { pill: 'bg-teal-50 text-teal-700', dot: 'bg-[#2DD4BF]' },
};

export function learnerTabs(lang: 'en' | 'ha') {
  const ha = lang === 'ha';
  return [
    { key: 'learn' as const, href: '/learn', label: ha ? 'Karatuna' : 'My learning', icon: BookOpen },
    { key: 'passport' as const, href: '/passport', label: ha ? 'Fasfo' : 'Passport', icon: IdCard },
    { key: 'jobs' as const, href: '/jobs', label: ha ? 'Ayyuka' : 'Jobs', icon: BriefcaseBusiness },
  ];
}

export const sectionOf = (path: string): LearnerSection | null =>
  path.startsWith('/learn') ? 'learn' : path.startsWith('/passport') ? 'passport' : path.startsWith('/jobs') ? 'jobs' : null;
