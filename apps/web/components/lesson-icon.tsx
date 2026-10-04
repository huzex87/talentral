import { CirclePlay, FileText, Headphones, ListChecks, NotebookText, PenLine, type LucideIcon } from 'lucide-react';
import type { LessonKind } from '@talentral/domain';

const ICONS: Record<LessonKind, LucideIcon> = { text: NotebookText, video: CirclePlay, audio: Headphones, pdf: FileText, quiz: ListChecks, assignment: PenLine };

// The kind of a lesson at a glance: reading, video, audio, document, quiz or assignment.
export function LessonIcon({ kind, className = 'size-4' }: { kind: LessonKind; className?: string }) {
  const Icon = ICONS[kind];
  return <Icon className={className} aria-hidden strokeWidth={1.75} />;
}
