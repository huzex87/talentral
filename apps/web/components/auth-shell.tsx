import { TalentralLogo } from './logo';
import { Card } from './ui';

// Sign-in, invitations and two-step: one calm column on a faint grid, the form in a single card.
export function AuthShell({ title, subtitle, lang, aside, children }: {
  title: string; subtitle?: string; lang?: 'en' | 'ha'; aside?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <main id="main" tabIndex={-1} className="relative flex min-h-dvh flex-col overflow-hidden" lang={lang}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[linear-gradient(to_right,var(--color-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-line)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_70%_at_50%_0%,#000_40%,transparent_100%)] opacity-70" />
      <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-12 sm:py-16">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex justify-center"><TalentralLogo height={28} /></div>
          <Card className="p-6 shadow-[var(--shadow-pop)] sm:p-8">
            <h1 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">{title}</h1>
            {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </Card>
          {aside && <div className="mt-6 flex justify-center">{aside}</div>}
        </div>
      </div>
      <footer className="relative flex justify-center gap-4 pb-6 text-xs text-muted">
        <span>Talentral · Verified skills. Real work.</span>
        <a href="/privacy" className="hover:text-ink">Privacy</a>
        <a href="/terms" className="hover:text-ink">Terms</a>
      </footer>
    </main>
  );
}
