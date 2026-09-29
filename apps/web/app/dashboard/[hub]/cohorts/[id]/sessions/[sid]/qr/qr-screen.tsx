'use client';
// The room screen: a QR code that changes every minute, so a photo of it sent to someone who is
// not in the room stops working almost at once.
import { useEffect, useState } from 'react';
import { sessionQr } from '../../../../actions';

export function QrScreen({ slug, sessionId, initial }: { slug: string; sessionId: string; initial: { svg: string; minute: number } }) {
  const [qr, setQr] = useState(initial);
  const [seconds, setSeconds] = useState(60 - new Date().getSeconds());
  useEffect(() => {
    const tick = setInterval(async () => {
      const s = 60 - new Date().getSeconds();
      setSeconds(s);
      if (s === 60 || Math.floor(Date.now() / 60000) !== qr.minute) {
        const next = await sessionQr(slug, sessionId).catch(() => null);
        if (next) setQr(next);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [slug, sessionId, qr.minute]);
  return (
    <div className="flex flex-col items-center">
      <div className="size-[min(70vh,80vw)] rounded-3xl bg-white p-4 shadow-2xl [&>svg]:size-full" role="img" aria-label="Check-in QR code" dangerouslySetInnerHTML={{ __html: qr.svg }} />
      <div className="mt-5 flex items-center gap-3 text-white/80">
        <span className="relative size-8">
          <svg viewBox="0 0 36 36" className="size-8 -rotate-90"><circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="4" />
            <circle cx="18" cy="18" r="15" fill="none" stroke="#14B8A6" strokeWidth="4" strokeDasharray={`${(seconds / 60) * 94.2} 94.2`} strokeLinecap="round" /></svg>
        </span>
        <span className="text-sm">New code in {seconds}s</span>
      </div>
    </div>
  );
}
