// The Talentral Course Library as hubs browse it (migration 0031): published library courses,
// their size and Hausa coverage, and the hub's own copy of each.

export type LibraryCourse = {
  id: string; title: string; summary: string | null; track: string | null; updated_at: Date; modules: number; lessons: number;
  minutes: number; quizzes: number; assignments: number; videos: number; hausa: number; copy_id: string | null; copied_at: Date | null;
};

export type OutlineLesson = { id: string; kind: 'text' | 'video' | 'audio' | 'pdf' | 'quiz' | 'assignment'; title: string; title_ha: string | null; minutes: number | null; hausa: boolean; questions: number; rubric: number };
export type OutlineModule = { id: string; title: string; title_ha: string | null; unlock_after_days: number | null; lessons: OutlineLesson[] };
export type LibraryOutline = { id: string; title: string; summary: string | null; track: string | null; updated_at: string; modules: OutlineModule[] };

// Study time, rounded for browsing: "45 min" or "12 hours".
export function studyTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

// How much of the course is in Hausa, from the share of lessons with Hausa titles.
export function hausaLabel(c: { hausa: number; lessons: number }): string | null {
  if (!c.lessons || !c.hausa) return null;
  return c.hausa >= c.lessons ? 'English and Hausa' : 'Hausa in part';
}

// Whether the library changed a course after the hub took its copy.
export function libraryNewer(updatedAt: Date | string | null | undefined, copiedAt: Date | string | null | undefined): boolean {
  return Boolean(updatedAt && copiedAt && new Date(updatedAt).getTime() > new Date(copiedAt).getTime());
}
