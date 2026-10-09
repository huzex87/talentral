'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { LESSON_KINDS, type LessonKind } from '@talentral/domain';
import { LessonIcon } from '@/components/lesson-icon';
import { Badge, Card, cx } from '@/components/ui';
import { reorderCourse } from '../actions';
import { AddLessonMenu, ModuleSettings } from '../forms';

export type OutlineLesson = { id: string; module_id: string; kind: LessonKind; title: string; title_ha: string | null; minutes: number | null; ready: boolean; questions: number };
export type OutlineModule = { id: string; title: string; title_ha: string | null; unlock_after_days: number | null };
type Col = OutlineModule & { lessons: OutlineLesson[] };
type Drag = { type: 'lesson'; id: string } | { type: 'module'; id: string } | null;

// The course outline: drag modules and lessons into place (lessons can move between modules), or
// use the arrow buttons, which also work from the keyboard. Each change saves straight away; if the
// save fails the outline goes back to how it was.
export function CourseOutline({ slug, courseId, modules, lessons }: { slug: string; courseId: string; modules: OutlineModule[]; lessons: OutlineLesson[] }) {
  const build = () => modules.map((m) => ({ ...m, lessons: lessons.filter((l) => l.module_id === m.id) }));
  const [cols, setCols] = useState<Col[]>(build);
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const last = useRef(cols);
  // Fresh data from the server (after adding a lesson or a module) replaces the local outline.
  useEffect(() => { const next = build(); setCols(next); last.current = next; }, [modules, lessons]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = (next: Col[], announce: string) => {
    const before = last.current;
    setCols(next);
    last.current = next;
    start(async () => {
      const r = await reorderCourse(slug, courseId, next.map((c) => ({ moduleId: c.id, lessonIds: c.lessons.map((l) => l.id) })));
      if (r.ok) setNote({ ok: true, text: announce });
      else { setCols(before); last.current = before; setNote({ ok: false, text: r.message ?? 'Could not save the new order.' }); }
    });
  };

  const moveModule = (id: string, to: number) => {
    const from = cols.findIndex((c) => c.id === id);
    if (from < 0 || to < 0 || to >= cols.length || from === to) return;
    const next = [...cols];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m!);
    save(next, `${m!.title} moved to position ${to + 1}.`);
  };
  const moveLesson = (id: string, toModule: string, toIndex: number) => {
    const next = cols.map((c) => ({ ...c, lessons: [...c.lessons] }));
    const src = next.find((c) => c.lessons.some((l) => l.id === id));
    const dst = next.find((c) => c.id === toModule);
    if (!src || !dst) return;
    const from = src.lessons.findIndex((l) => l.id === id);
    const [l] = src.lessons.splice(from, 1);
    const at = Math.max(0, Math.min(src === dst && from < toIndex ? toIndex - 1 : toIndex, dst.lessons.length));
    dst.lessons.splice(at, 0, l!);
    if (src === dst && from === at) return;
    save(next, `${l!.title} moved${src === dst ? '' : ` to ${dst.title}`}.`);
  };

  const drop = (e: React.DragEvent, moduleId: string, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (drag?.type === 'lesson') moveLesson(drag.id, moduleId, index);
    if (drag?.type === 'module') moveModule(drag.id, cols.findIndex((c) => c.id === moduleId));
    setDrag(null);
    setOver(null);
  };

  return (
    <div className="min-w-0 space-y-4">
      <p className="sr-only" role="status" aria-live="polite">{note?.text}</p>
      {note && !note.ok && <p className="rounded-lg border border-danger/20 bg-danger-50 px-3 py-2 text-sm text-danger" role="alert">{note.text}</p>}
      {cols.map((m, mi) => (
        <Card key={m.id} className={cx('p-5 transition-shadow', drag?.type === 'module' && over === `m-${m.id}` && 'ring-2 ring-blue/40', drag?.type === 'module' && drag.id === m.id && 'opacity-60')}
          onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(drag.type === 'module' ? `m-${m.id}` : `l-${m.id}-${m.lessons.length}`); } }}
          onDrop={(e) => drop(e, m.id, m.lessons.length)}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDrag({ type: 'module', id: m.id }); }} onDragEnd={() => { setDrag(null); setOver(null); }}
                className="mt-1 hidden cursor-grab touch-none rounded p-0.5 text-subtle hover:bg-hover hover:text-ink active:cursor-grabbing md:block" title="Drag to reorder modules" aria-hidden>
                <GripVertical className="size-4" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold">{m.title}</h2>
                <p className="text-xs text-muted">{m.title_ha ? `${m.title_ha} · ` : ''}{m.unlock_after_days === null ? 'Open from the start' : `Opens ${m.unlock_after_days} days after the cohort starts`} · {m.lessons.length} {m.lessons.length === 1 ? 'lesson' : 'lessons'}</p>
              </div>
            </div>
            <div className="flex gap-1">
              <button type="button" className="grid size-8 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink disabled:opacity-35" disabled={mi === 0 || pending} onClick={() => moveModule(m.id, mi - 1)} aria-label={`Move ${m.title} up`}><ArrowUp className="size-4" aria-hidden /></button>
              <button type="button" className="grid size-8 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink disabled:opacity-35" disabled={mi === cols.length - 1 || pending} onClick={() => moveModule(m.id, mi + 1)} aria-label={`Move ${m.title} down`}><ArrowDown className="size-4" aria-hidden /></button>
            </div>
          </div>
          <ol className={cx('mb-3 rounded-xl border', m.lessons.length ? 'divide-y divide-line border-line' : 'border-dashed border-line-strong', drag?.type === 'lesson' && over?.startsWith(`l-${m.id}-`) && 'border-blue/50')} aria-label={`Lessons in ${m.title}`}>
            {m.lessons.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">{drag?.type === 'lesson' ? 'Drop a lesson here' : 'No lessons yet. Add the first one below.'}</li>}
            {m.lessons.map((l, li) => (
              <li key={l.id}
                draggable onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; setDrag({ type: 'lesson', id: l.id }); }} onDragEnd={() => { setDrag(null); setOver(null); }}
                onDragOver={(e) => { if (drag?.type === 'lesson') { e.preventDefault(); e.stopPropagation(); setOver(`l-${m.id}-${li}`); } }}
                onDrop={(e) => drop(e, m.id, li)}
                className={cx('group relative flex items-center gap-3 bg-white px-3 py-2.5 first:rounded-t-xl last:rounded-b-xl',
                  drag?.type === 'lesson' && drag.id === l.id && 'opacity-50',
                  drag?.type === 'lesson' && over === `l-${m.id}-${li}` && 'before:absolute before:inset-x-2 before:-top-px before:h-0.5 before:rounded-full before:bg-blue')}>
                <GripVertical className="hidden size-4 shrink-0 cursor-grab text-mist group-hover:text-subtle md:block" aria-hidden />
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-white text-muted"><LessonIcon kind={l.kind} /></span>
                <Link href={`/dashboard/${slug}/courses/${courseId}/lessons/${l.id}`} className="min-w-0 flex-1" draggable={false}>
                  <span className="block truncate font-semibold hover:text-blue">{l.title}</span>
                  <span className="text-xs text-muted">{LESSON_KINDS[l.kind]}{l.minutes ? ` · ${l.minutes} min` : ''}{l.kind === 'quiz' ? ` · ${l.questions} questions` : ''}{l.title_ha ? ' · Hausa ✓' : ''}</span>
                </Link>
                {!l.ready && <Badge tone="amber">Needs content</Badge>}
                <span className="flex shrink-0">
                  <button type="button" className="grid size-8 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink disabled:opacity-35" disabled={pending || (li === 0 && mi === 0)}
                    onClick={() => (li === 0 ? moveLesson(l.id, cols[mi - 1]!.id, cols[mi - 1]!.lessons.length) : moveLesson(l.id, m.id, li - 1))} aria-label={`Move ${l.title} up`}><ArrowUp className="size-4" aria-hidden /></button>
                  <button type="button" className="grid size-8 place-items-center rounded-md text-muted hover:bg-hover hover:text-ink disabled:opacity-35" disabled={pending || (li === m.lessons.length - 1 && mi === cols.length - 1)}
                    onClick={() => (li === m.lessons.length - 1 ? moveLesson(l.id, cols[mi + 1]!.id, 0) : moveLesson(l.id, m.id, li + 2))} aria-label={`Move ${l.title} down`}><ArrowDown className="size-4" aria-hidden /></button>
                </span>
              </li>
            ))}
          </ol>
          <AddLessonMenu slug={slug} courseId={courseId} moduleId={m.id} moduleTitle={m.title} />
          <div className="mt-3"><ModuleSettings slug={slug} courseId={courseId} module={m} /></div>
        </Card>
      ))}
    </div>
  );
}
