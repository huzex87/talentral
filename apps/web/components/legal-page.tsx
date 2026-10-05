import Link from 'next/link';
import { TalentralLogo } from './logo';

// The quiet public header for content pages: stories, privacy notice and terms.
export function PublicHeader({ width = 'max-w-3xl' }: { width?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/85 backdrop-blur-md">
      <div className={`mx-auto flex h-14 ${width} items-center justify-between gap-4 px-4 sm:px-6`}>
        <TalentralLogo height={22} />
        <nav aria-label="Main" className="flex items-center gap-1 text-sm font-medium">
          <Link href="/stories" className="rounded-md px-3 py-1.5 text-muted transition-colors hover:text-ink">Stories</Link>
          <Link href="/jobs" className="hidden rounded-md px-3 py-1.5 text-muted transition-colors hover:text-ink sm:inline">Jobs</Link>
          <Link href="/sign-in" className="rounded-md px-3 py-1.5 text-muted transition-colors hover:text-ink">Sign in</Link>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter({ width = 'max-w-3xl' }: { width?: string }) {
  return (
    <footer className="border-t border-line">
      <div className={`mx-auto flex ${width} flex-wrap gap-x-4 gap-y-1 px-4 py-8 text-sm text-muted sm:px-6`}>
        <span>© {new Date().getFullYear()} Talentral</span>
        <Link href="/privacy" className="hover:text-ink">Privacy</Link>
        <Link href="/terms" className="hover:text-ink">Terms</Link>
        <a href="mailto:privacy@talentral.ng" className="hover:text-ink">privacy@talentral.ng</a>
      </div>
    </footer>
  );
}

// Plain public frame for the privacy notice, terms and similar pages.
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
        <div className="legal mt-10 space-y-8 text-[15px] leading-relaxed text-ink-2 [&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:decoration-line-strong [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:mt-1.5 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
