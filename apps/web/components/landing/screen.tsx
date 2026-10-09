// Real product screenshots for public pages, in a browser window or a phone. Each one is a
// screen from the Talentral demo academy, captured from the running product.
import Image from 'next/image';
import { cx } from '../ui';

export function BrowserShot({ src, alt, url, width, height, priority, className }: {
  src: string; alt: string; url: string; width: number; height: number; priority?: boolean; className?: string;
}) {
  return (
    <figure className={cx('overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_40px_80px_-24px_rgba(16,24,40,0.24)]', className)}>
      <div className="flex h-9 items-center gap-3 border-b border-line bg-canvas px-3.5" aria-hidden>
        <span className="flex gap-1.5"><i className="size-2.5 rounded-full bg-line-strong" /><i className="size-2.5 rounded-full bg-line-strong" /><i className="size-2.5 rounded-full bg-line-strong" /></span>
        <span className="mx-auto truncate rounded-md border border-line bg-white px-3 py-0.5 font-mono text-[11px] text-muted">{url}</span>
        <span className="w-10 max-sm:hidden" />
      </div>
      <Image src={src} alt={alt} width={width} height={height} priority={priority} sizes="(min-width: 1024px) 900px, 100vw" className="block h-auto w-full" />
    </figure>
  );
}

export function PhoneShot({ src, alt, width, height, className }: { src: string; alt: string; width: number; height: number; className?: string }) {
  return (
    <figure className={cx('w-[200px] rounded-[2.2rem] border border-[#2A3352] bg-[#04071A] p-2 shadow-[0_30px_60px_-20px_rgba(10,16,36,0.55)] sm:w-[230px]', className)}>
      <div className="overflow-hidden rounded-[1.75rem] bg-white">
        <div className="flex h-6 items-center justify-center bg-midnight" aria-hidden><span className="h-3.5 w-16 rounded-full bg-black" /></div>
        <Image src={src} alt={alt} width={width} height={height} sizes="230px" className="block h-auto w-full" />
      </div>
    </figure>
  );
}
