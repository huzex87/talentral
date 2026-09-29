import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Talentral · Verified skills. Real work.', template: '%s · Talentral' },
  description: 'Talentral is the skills-to-work platform: apply to programmes, learn in cohorts, prove your skills and connect to work.',
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  openGraph: { images: ['/brand/social-card.png'] },
};

export const viewport: Viewport = { themeColor: '#0D1230', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
