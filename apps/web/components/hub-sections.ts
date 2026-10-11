// The hub dashboard's sections, by the job they do. Reviewers get their own work first; owners and
// admins also get teaching, results and settings. Facilitators teach only, so they never see
// Applications. The sidebar, the phone tabs and the Ctrl+K
// search all read from here, so they never disagree.
import {
  Activity, BarChart3, BookOpen, Building2, ClipboardCheck, FileText, Globe, Inbox, LayoutGrid, Library, Megaphone,
  Route, ScrollText, Send, Tags, Target, Users, UsersRound, Webhook, type LucideIcon,
} from 'lucide-react';

export type SectionItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; count?: 'toScore' | 'toGrade'; keywords?: string };
export type SectionGroup = { title?: string; items: SectionItem[] };

export function hubSections(slug: string, manage: boolean, select = true, library = false): SectionGroup[] {
  const base = `/dashboard/${slug}`;
  // The Course Library workspace only builds courses: no applicants, cohorts or results.
  if (library) {
    return [
      { title: 'Course Library', items: [{ href: `${base}/courses`, label: 'Library courses', icon: BookOpen, keywords: 'lessons modules quiz library' }] },
      { title: 'Settings', items: [
        { href: `${base}/team`, label: 'Team', icon: UsersRound, keywords: 'faculty tutors invite' },
        { href: `${base}/audit`, label: 'Audit log', icon: ScrollText },
      ] },
    ];
  }
  const work: SectionItem[] = [
    { href: base, label: 'Overview', icon: LayoutGrid, exact: true, keywords: 'home dashboard' },
    { href: `${base}/applications`, label: 'Applications', icon: Inbox, count: 'toScore', keywords: 'applicants review score shortlist' },
    { href: `${base}/grading`, label: 'Grading', icon: ClipboardCheck, count: 'toGrade', keywords: 'marking assignments submissions' },
    { href: `${base}/cohorts`, label: 'Cohorts', icon: Users, keywords: 'classes attendance register learners' },
  ];
  if (!manage) return [{ title: 'Your work', items: select ? work : work.filter((i) => i.href !== `${base}/applications`) }];
  return [
    { items: work },
    { title: 'Teaching', items: [
      { href: `${base}/programmes`, label: 'Programmes', icon: Megaphone, keywords: 'calls applications form' },
      { href: `${base}/courses`, label: 'Courses', icon: BookOpen, keywords: 'lessons modules quiz' },
      { href: `${base}/library`, label: 'Course library', icon: Library, keywords: 'ready-made courses hausa talentral faculty' },
      { href: `${base}/paths`, label: 'Learning paths', icon: Route },
      { href: `${base}/skills`, label: 'Skills', icon: Tags },
      { href: `${base}/messages`, label: 'Messages', icon: Send, keywords: 'email sms whatsapp announce' },
    ] },
    { title: 'Results', items: [
      { href: `${base}/impact`, label: 'Impact', icon: BarChart3, keywords: 'funnel export funder' },
      { href: `${base}/outcomes`, label: 'Outcomes', icon: Target, keywords: 'placements jobs completion gate g3' },
      { href: `${base}/health`, label: 'Engagement', icon: Activity, keywords: 'nps activation weekly active gate g2' },
      { href: `${base}/reports`, label: 'Reports', icon: FileText, keywords: 'milestone evidence print' },
    ] },
    { title: 'Settings', items: [
      { href: `${base}/profile`, label: 'Hub profile', icon: Building2, keywords: 'logo colour cover photo' },
      { href: `${base}/branding`, label: 'Domain and emails', icon: Globe },
      { href: `${base}/team`, label: 'Team', icon: UsersRound, keywords: 'invite members roles' },
      { href: `${base}/webhooks`, label: 'Webhooks', icon: Webhook },
      { href: `${base}/audit`, label: 'Audit log', icon: ScrollText },
    ] },
  ];
}

// Things staff start from anywhere.
export function hubCreateActions(slug: string, manage: boolean, library = false): { href: string; label: string }[] {
  if (!manage) return [];
  const base = `/dashboard/${slug}`;
  if (library) return [{ href: `${base}/courses/new`, label: 'New course' }, { href: `${base}/team`, label: 'Invite a team member' }];
  return [
    { href: `${base}/programmes/new`, label: 'New programme' },
    { href: `${base}/cohorts/new`, label: 'New cohort' },
    { href: `${base}/courses/new`, label: 'New course' },
    { href: `${base}/messages`, label: 'Send a message' },
    { href: `${base}/team`, label: 'Invite a team member' },
  ];
}
