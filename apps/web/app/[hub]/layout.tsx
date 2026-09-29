import { notFound } from 'next/navigation';
import Link from 'next/link';
import { buttonColor, slugProblem } from '@talentral/domain';
import { TalentralLogo } from '@/components/logo';
import { publicHub, logoUrl } from '@/lib/hubs';
import { hubPath } from '@/lib/urls';

export default async function HubLayout({ children, params }: { children: React.ReactNode; params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  if (slugProblem(slug)) notFound();
  const data = await publicHub(slug);
  if (!data) notFound();
  const { hub, isMember } = data;
  const logo = logoUrl(hub);
  return (
    <div style={{ ['--hub' as string]: buttonColor(hub.brand_color) }} className="flex min-h-dvh flex-col">
      <div className="h-1.5 bg-[var(--hub)]" />
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link href={hubPath(hub.slug)} className="flex min-w-0 items-center gap-3">
            {logo
              ? <img src={logo} alt={`${hub.name} logo`} className="h-10 w-auto max-w-40 object-contain" />
              : <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--hub)] font-display text-lg font-semibold text-white">{hub.name[0]}</span>}
            <span className="truncate font-display text-lg font-semibold">{hub.name}</span>
          </Link>
          {isMember && <Link href={`/dashboard/${hub.slug}`} className="text-sm font-semibold text-blue hover:underline">Hub dashboard</Link>}
        </div>
      </header>
      {hub.status !== 'active' && (
        <div className="bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-800">This hub is suspended and hidden from the public.</div>
      )}
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>{hub.name}{hub.contact_email ? ` · ${hub.contact_email}` : ''}{hub.contact_phone ? ` · ${hub.contact_phone}` : ''}</span>
          <span className="flex items-center gap-2">Powered by <TalentralLogo height={18} /></span>
        </div>
      </footer>
    </div>
  );
}
