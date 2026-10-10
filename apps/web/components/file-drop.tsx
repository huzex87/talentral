'use client';
import { useState, type ComponentProps } from 'react';
import { FileCheck2, UploadCloud } from 'lucide-react';
import { cx } from './ui';

// A drop area for file fields. The real file input covers the whole area (transparent), so a
// click opens the picker, a dropped file lands in it, the field's label still names it, and the
// form posts it exactly as before. Shows the chosen file's name once picked.
export function FileDrop({ prompt = 'Choose a file or drag it here', types, className, onChange, compact = false, ...input }: ComponentProps<'input'> & {
  prompt?: string; types?: string; compact?: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  return (
    <div className={cx('relative flex items-center gap-3 rounded-[var(--radius-card)] border border-dashed bg-white transition-colors',
      compact ? 'px-3 py-3' : 'flex-col justify-center px-4 py-6 text-center sm:py-7',
      over ? 'border-blue bg-blue-50/60' : 'border-line-strong hover:border-blue/50 hover:bg-canvas/50',
      'has-[:focus-visible]:border-blue has-[:focus-visible]:shadow-[0_0_0_4px_rgba(46,91,255,0.12)] has-[:disabled]:opacity-60 has-[[aria-invalid=true]]:border-danger',
      className)}>
      <span aria-hidden className={cx('grid shrink-0 place-items-center rounded-full', compact ? 'size-9' : 'size-11', picked ? 'bg-teal-50 text-teal-700' : 'bg-blue-50 text-blue')}>
        {picked ? <FileCheck2 className="size-5" strokeWidth={1.75} /> : <UploadCloud className="size-5" strokeWidth={1.75} />}
      </span>
      <span className={cx('min-w-0', compact && 'flex-1 text-left')} aria-hidden>
        <span className="block truncate text-sm font-medium text-ink">{picked ?? prompt}</span>
        <span className="mt-0.5 block text-xs text-muted">{picked ? 'Click or drop to choose a different file' : types}</span>
      </span>
      <input type="file" {...input}
        onChange={(e) => { setPicked(e.currentTarget.files?.[0]?.name ?? null); onChange?.(e); }}
        onDragEnter={() => setOver(true)} onDragLeave={() => setOver(false)} onDrop={() => setOver(false)}
        className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
    </div>
  );
}
