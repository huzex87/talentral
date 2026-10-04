// A calm, branded full page for "not found" and "something went wrong", with a clear way forward.
import type { ReactNode } from 'react';
import { TalentralLogo } from './logo';

export function StatusPage({ code, title, children, actions, lang }: { code?: string; title: string; children: ReactNode; actions: ReactNode; lang?: string }) {
  return (
    <main id="main" tabIndex={-1} className="flex min-h-dvh flex-col bg-canvas" lang={lang}>
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg text-center">
          <div className="mb-8 flex justify-center"><TalentralLogo height={30} /></div>
          {code && <p className="font-mono text-sm font-medium text-muted" aria-hidden>Error {code}</p>}
          <h1 className="mt-3 text-2xl font-semibold tracking-[-0.022em] sm:text-3xl">{title}</h1>
          <div className="mx-auto mt-3 max-w-md space-y-2 text-[15px] leading-relaxed text-muted">{children}</div>
          <div className="mt-8 flex flex-wrap justify-center gap-2">{actions}</div>
        </div>
      </div>
    </main>
  );
}
