'use client';
// Share a programme's application page: copy the link, use the phone's own share sheet, send it
// straight to WhatsApp and other channels with a message the hub can edit, or download a QR code
// for posters and flyers.
import { useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, Textarea, cx } from './ui';

type State = 'open' | 'not_yet_open' | 'closed' | 'draft';

export interface ShareProgrammeProps {
  url: string; title: string; hub: string; state: State;
  opens: string | null; closes: string | null;
  qrSvg: string; slug: string;
  variant?: 'primary' | 'secondary';
}

function defaultMessage({ url, title, hub, state, opens, closes }: Pick<ShareProgrammeProps, 'url' | 'title' | 'hub' | 'state' | 'opens' | 'closes'>): string {
  if (state === 'not_yet_open') return `${title} with ${hub}: applications open ${opens ?? 'soon'}. Get ready and apply here: ${url}`;
  return `Applications are open for ${title} with ${hub}.${closes ? ` Apply before ${closes}.` : ''} Apply here: ${url}`;
}

const enc = encodeURIComponent;

const Icon = {
  whatsapp: <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9 0-1.4.7-2 1-2.3.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.2Z" />,
  facebook: <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.4H8v3h2.6V21h2.9Z" />,
  x: <path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L2 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" />,
  linkedin: <path d="M6.9 8.5H3.6V20h3.3V8.5ZM5.3 3.3a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8ZM20.4 13.4c0-3.1-1.7-5.1-4.5-5.1-1.5 0-2.5.8-2.9 1.6V8.5H9.8V20h3.3v-5.9c0-1.5.6-2.7 2.1-2.7s2 1.1 2 2.8V20h3.2v-6.6Z" />,
  telegram: <path d="M21.5 4.3 18.3 19.6c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2l-11 6.9-4.7-1.5c-1-.3-1-1 .2-1.5l18.4-7.1c.9-.3 1.6.2 1.5 1.5Z" />,
  email: <path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 2.4V17h16V7.4l-8 5.3-8-5.3ZM5.2 7 12 11.5 18.8 7H5.2Z" />,
  sms: <path d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H8l-4 3.5V18a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />,
  share: <path d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7c0 .3 0 .5.1.8L8.4 11.2a3 3 0 1 0 0 3.6l6.7 3.4A3 3 0 1 0 18 16Z" />,
};

function Glyph({ name, className }: { name: keyof typeof Icon; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cx('size-5', className)}>{Icon[name]}</svg>;
}

export function ShareProgramme(props: ShareProgrammeProps) {
  const { url, title, hub, state, qrSvg, slug, variant = 'primary' } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState(() => defaultMessage(props));
  const [copied, setCopied] = useState<'link' | 'message' | null>(null);
  const [canShare, setCanShare] = useState(false);
  const id = useId();
  useEffect(() => { setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'); }, []);

  const copy = async (text: string, what: 'link' | 'message') => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      // Older browsers: select a hidden field and copy.
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    setCopied(what); setTimeout(() => setCopied(null), 2200);
  };

  const channels: { key: keyof typeof Icon; label: string; href: string; tone: string }[] = [
    { key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${enc(message)}`, tone: 'bg-[#25D366] text-white' },
    { key: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`, tone: 'bg-[#1877F2] text-white' },
    { key: 'x', label: 'X', href: `https://x.com/intent/post?text=${enc(message)}`, tone: 'bg-ink text-white' },
    { key: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`, tone: 'bg-[#0A66C2] text-white' },
    { key: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${enc(url)}&text=${enc(message.replace(url, '').trim())}`, tone: 'bg-[#229ED9] text-white' },
    { key: 'email', label: 'Email', href: `mailto:?subject=${enc(`${title}: apply with ${hub}`)}&body=${enc(message)}`, tone: 'bg-canvas text-ink border border-line' },
    { key: 'sms', label: 'SMS', href: `sms:?&body=${enc(message)}`, tone: 'bg-canvas text-ink border border-line' },
  ];

  // The QR code as a PNG, drawn from the SVG at poster size.
  const downloadQr = () => {
    const img = new Image();
    const svg = qrSvg.replace('<svg', '<svg width="1024" height="1024"');
    img.onload = () => {
      const size = 1024, pad = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size + pad * 2; canvas.height = size + pad * 2;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, pad, pad, size, size);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${slug}-apply-qr.png`;
      a.click();
    };
    img.src = `data:image/svg+xml;charset=utf-8,${enc(svg)}`;
  };

  return (
    <>
      <Button type="button" variant={variant} onClick={() => dialog.current?.showModal()} aria-haspopup="dialog">
        <Glyph name="share" className="size-4" />Share
      </Button>
      <dialog ref={dialog} aria-labelledby={`${id}-t`}
        className="m-auto w-[min(34rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]"
        onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }}>
        <div className="space-y-5 p-5 sm:p-6">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={`${id}-t`} className="text-lg font-semibold">Share the application page</h2>
              <p className="mt-0.5 truncate text-sm text-muted">{title}</p>
            </div>
            <button type="button" onClick={() => dialog.current?.close()} className="-mr-2 grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink" aria-label="Close">✕</button>
          </header>

          {state === 'draft' && <Alert tone="amber" title="Not published yet">This programme is a draft, so only your team can open the link. Open applications first, then share it.</Alert>}
          {state === 'closed' && <Alert tone="amber" title="Applications are closed">People who follow the link will see that applications have closed.</Alert>}
          {state === 'not_yet_open' && <Alert tone="blue">Applications open {props.opens ?? 'soon'}. People who follow the link now can read about the programme and come back.</Alert>}

          <div className="space-y-1.5">
            <label htmlFor={`${id}-url`} className="block text-sm font-semibold">Application link</label>
            <div className="flex gap-2">
              <input id={`${id}-url`} readOnly value={url} onFocus={(e) => e.currentTarget.select()}
                className="h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line bg-canvas/60 px-3 font-mono text-[13px] text-ink outline-none focus:border-blue" />
              <Button type="button" onClick={() => copy(url, 'link')} className="shrink-0">{copied === 'link' ? '✓ Copied' : 'Copy link'}</Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Share to</p>
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7" aria-label="Share to">
              {channels.map((c) => (
                <li key={c.key}>
                  <a href={c.href} target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center gap-1.5 rounded-xl p-1.5 text-center text-[11px] font-semibold text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40">
                    <span className={cx('grid size-11 place-items-center rounded-full transition group-hover:scale-105', c.tone)}><Glyph name={c.key} /></span>
                    {c.label}
                  </a>
                </li>
              ))}
            </ul>
            {canShare && (
              <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => navigator.share({ title, text: message.replace(url, '').trim(), url }).catch(() => {})}>
                <Glyph name="share" className="size-4" />More ways to share
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`${id}-msg`} className="block text-sm font-semibold">Message <span className="font-normal text-muted">(edit before sharing)</span></label>
            <Textarea id={`${id}-msg`} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-20 text-sm" />
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => setMessage(defaultMessage(props))} className="text-xs font-semibold text-muted hover:text-ink">Reset message</button>
              <Button type="button" variant="ghost" size="sm" onClick={() => copy(message, 'message')}>{copied === 'message' ? '✓ Copied' : 'Copy message'}</Button>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-xl border border-line bg-canvas/50 p-4">
            <div className="size-24 shrink-0 rounded-lg bg-white p-2" role="img" aria-label="QR code for the application page" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="min-w-0 space-y-2">
              <p className="text-sm font-semibold">QR code for posters and flyers</p>
              <p className="text-xs text-muted">People scan it with their phone camera to open the application page.</p>
              <Button type="button" variant="secondary" size="sm" onClick={downloadQr}>Download QR code</Button>
            </div>
          </div>
        </div>
      </dialog>
      <span className="sr-only" role="status" aria-live="polite">{copied ? `${copied === 'link' ? 'Link' : 'Message'} copied` : ''}</span>
    </>
  );
}
