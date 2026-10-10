// A focused screen for creating one thing: a way back, the form on its own card, and a short
// "what happens next" so staff know the steps after this one.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Card } from './ui';

export function CreateScreen({ back, backLabel, label, title, description, next, children }: {
  back: string; backLabel: string; label: string; title: string; description: ReactNode; next: string[]; children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <Link href={back} className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"><ArrowLeft className="size-4" aria-hidden />{backLabel}</Link>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-blue-600">{label}</p>
          <h1 className="text-[26px] font-semibold leading-tight sm:text-[30px]">{title}</h1>
          <p className="mb-6 mt-1.5 max-w-xl text-[15px] leading-relaxed text-muted">{description}</p>
          <Card className="p-5 sm:p-7">{children}</Card>
        </div>
        <aside className="lg:pt-24" aria-labelledby="next-steps">
          <div className="rounded-[var(--radius-card)] border border-line bg-white/60 p-5">
            <h2 id="next-steps" className="text-sm font-semibold">What happens next</h2>
            <ol className="mt-3 space-y-3">
              {next.map((s, i) => (
                <li key={s} className="flex gap-3 text-sm leading-snug text-ink-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-blue-50 font-display text-xs font-semibold text-blue-600" aria-hidden>{i + 1}</span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
