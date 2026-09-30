import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Talentral · Verified skills. Real work.', template: '%s · Talentral' },
  description: 'Talentral is the skills-to-work platform: apply to programmes, learn in cohorts, prove your skills and connect to work.',
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  openGraph: { images: ['/brand/social-card.png'] },
  applicationName: 'Talentral',
  appleWebApp: { capable: true, title: 'Talentral', statusBarStyle: 'default' },
};

export const viewport: Viewport = { themeColor: '#0D1230', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a href="#main" className="sr-only z-50 rounded-lg bg-ink px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
