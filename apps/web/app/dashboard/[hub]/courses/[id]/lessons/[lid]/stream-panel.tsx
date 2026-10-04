'use client';
import { useEffect, useRef, useState } from 'react';
import { formatBytes } from '@talentral/domain';
import { Alert, Badge, Button, cx } from '@/components/ui';
import { tusUpload } from '@/lib/tus';
import { checkStream, removeStream, startStreamUpload, type StreamState } from '../../../stream-actions';

const minutes = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : null);

// Upload a video for streaming: it goes straight to the video service in resumable chunks, then is
// encoded into lighter versions so learners on slow or costly data can still watch.
export function StreamPanel({ slug, lessonId, initial }: { slug: string; lessonId: string; initial: StreamState }) {
  const [state, setState] = useState<StreamState>(initial);
  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  // While the video is encoding, check every 8 seconds.
  useEffect(() => {
    if (state.status !== 'processing' && state.status !== 'uploading') return;
    if (progress) return;
    const t = setInterval(() => { checkStream(slug, lessonId).then(setState).catch(() => {}); }, 8000);
    return () => clearInterval(t);
  }, [state.status, progress, slug, lessonId]);

  // Warn before leaving mid-upload.
  useEffect(() => {
    if (!progress) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [progress]);

  const upload = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const start = await startStreamUpload(slug, lessonId, file.name, file.type, file.size);
      if (!start.ok) { setError(start.error); return; }
      setState({ status: 'uploading', renditions: [], seconds: null });
      abort.current = new AbortController();
      setProgress({ sent: 0, total: file.size });
      await tusUpload(file, start.target, (sent, total) => setProgress({ sent, total }), abort.current.signal);
      setProgress(null);
      setState(await checkStream(slug, lessonId, true));
    } catch (e) {
      setProgress(null);
      setError(abort.current?.signal.aborted ? 'Upload cancelled.' : e instanceof Error ? e.message : 'The upload failed. Please try again.');
      setState(await checkStream(slug, lessonId).catch(() => state));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    if (!confirm('Remove the streamed video from this lesson?')) return;
    setBusy(true);
    setState(await removeStream(slug, lessonId));
    setBusy(false);
  };

  const pct = progress ? Math.floor((progress.sent / Math.max(progress.total, 1)) * 100) : 0;
  return (
    <section aria-labelledby="stream-h" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="stream-h" className="text-lg font-semibold">Streamed video</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">Upload the video once. Talentral makes lighter versions (240p to 720p) and plays the one each learner’s connection can carry, with a small 360p version for data saver and offline. Best for anything longer than a few minutes.</p>
        </div>
        {state.status === 'ready' && <Badge tone="teal">Ready to stream</Badge>}
        {state.status === 'processing' && <Badge tone="blue">Preparing</Badge>}
        {state.status === 'failed' && <Badge tone="danger">Failed</Badge>}
      </div>

      {progress && (
        <div role="status" aria-live="polite" className="rounded-xl border border-blue/20 bg-blue-50/50 p-4">
          <div className="flex justify-between text-sm font-semibold"><span>Uploading…</span><span className="tabular-nums">{pct}%</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-blue transition-[width]" style={{ width: `${pct}%` }} /></div>
          <p className="mt-2 text-xs text-muted">{formatBytes(progress.sent)} of {formatBytes(progress.total)}. If the connection drops, it picks up where it stopped. Keep this page open.</p>
          <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => abort.current?.abort()}>Cancel upload</Button>
        </div>
      )}

      {!progress && state.status === 'processing' && (
        <Alert tone="blue" title="Uploaded. Preparing the lighter versions…">This usually takes a few minutes for each minute of video. You can leave this page; learners see the video as soon as it is ready.</Alert>
      )}
      {!progress && state.status === 'uploading' && !busy && (
        <Alert tone="amber" title="The last upload did not finish">Choose the file again to upload it.</Alert>
      )}
      {state.status === 'failed' && <Alert tone="danger" title="The video could not be prepared">The file may be damaged or in an unusual format. Try exporting it as MP4 (H.264) and upload it again.</Alert>}

      {state.status === 'ready' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-teal-700/20 bg-teal-50/50 p-4 text-sm">
          <span className="font-semibold text-teal-700">✓ Learners can watch this video</span>
          {minutes(state.seconds) && <span className="text-muted">Length {minutes(state.seconds)}</span>}
          {state.renditions.length > 0 && (
            <span className="flex flex-wrap items-center gap-1.5 text-muted">Versions
              {state.renditions.map((r) => <span key={r} className="rounded-md border border-line bg-white px-1.5 py-0.5 text-xs font-semibold text-ink">{r}</span>)}
            </span>
          )}
        </div>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <label className={cx('cursor-pointer inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0 h-10 px-4 text-sm bg-white text-ink border border-line-strong shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:bg-hover hover:border-mist has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue/40', (busy || progress) && 'pointer-events-none opacity-60')}>
          {state.status ? 'Replace video' : 'Upload video for streaming'}
          <input ref={input} type="file" accept="video/*" className="sr-only" disabled={busy || Boolean(progress)}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        </label>
        {state.status && !progress && <Button type="button" variant="ghost" disabled={busy} onClick={remove}>Remove</Button>}
        <span className="text-xs text-muted">Up to 4 GB. MP4, MOV or WebM.</span>
      </div>
    </section>
  );
}
