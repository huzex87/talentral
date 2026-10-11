'use client';
import { useState } from 'react';
import { CheckCircle2, ChevronDown, CircleAlert, Play } from 'lucide-react';
import { checkVideoLink } from '@/lib/video-link';
import { Field, Input, cx } from './ui';

const STEPS: { title: string; body: React.ReactNode }[] = [
  { title: 'Upload to YouTube', body: <>In the YouTube app tap <b>+</b> then <b>Upload a video</b>, or go to <b>studio.youtube.com</b> and choose <b>Create › Upload videos</b>.</> },
  { title: 'Set it to Unlisted', body: <>Under <b>Visibility</b> choose <b>Unlisted</b>: only people with the link can watch, and your learners get it through Talentral. <b>Private</b> videos will not play for learners.</> },
  { title: 'Copy the link', body: <>When it has uploaded, open the video, tap <b>Share</b>, then <b>Copy link</b>. It looks like <span className="font-mono text-[12px]">https://youtu.be/AbC123xyz</span>.</> },
  { title: 'Paste it below and save', body: <>The video appears below so you can check it is the right one, then press <b>Save lesson</b>.</> },
];

// The video lesson's link field, with the steps for an unlisted YouTube video, a check as the
// link is pasted and a preview of what learners will see.
export function VideoLinkField({ defaultValue, error }: { defaultValue: string; error?: string }) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(!defaultValue);
  const check = checkVideoLink(value);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-white">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="video-guide"
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas/60">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#FF0000]/10 text-[#D90000]" aria-hidden><Play className="size-4 fill-current" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">How to add a video from YouTube</span>
            <span className="block text-[13px] text-muted">Four steps, about two minutes. Use an Unlisted video.</span>
          </span>
          <ChevronDown className={cx('size-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
        {open && (
          <ol id="video-guide" className="grid gap-3 border-t border-line bg-canvas/40 p-4 sm:grid-cols-2">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3 rounded-lg border border-line bg-white p-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-blue text-[12px] font-bold text-white" aria-hidden>{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{s.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <Field label="YouTube video link" htmlFor="ls-url" error={error}
        hint="Learners can lower the quality in the player to save data. For a short clip you can also upload an MP4 below instead.">
        <Input id="ls-url" name="media_url" type="url" inputMode="url" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)}
          placeholder="https://youtu.be/…" aria-invalid={check.state === 'problem' || undefined} aria-describedby="ls-url-check" />
      </Field>

      <div id="ls-url-check" aria-live="polite">
        {check.state === 'problem' && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-800/15 bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-amber-800">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{check.message}
          </p>
        )}
        {check.state === 'ok' && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-teal-700">
              <CheckCircle2 className="size-4" aria-hidden />Video found. This is what learners will see{check.vimeo ? ' (a public Vimeo video)' : ''}.
            </p>
            <div className="aspect-video max-w-xl overflow-hidden rounded-xl bg-ink shadow-[var(--shadow-card)]">
              <iframe src={check.embed} title="Video preview" className="size-full" allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
            </div>
            <p className="text-xs text-muted">If the preview says the video is private or unavailable, set it to <b>Unlisted</b> on YouTube.</p>
          </div>
        )}
      </div>
    </div>
  );
}
