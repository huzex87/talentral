import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { withUser } from '@talentral/db';
import { CERTIFICATE_PATTERN, PARTNER_ROLES, type PartnerSnapshot } from '@talentral/domain';
import { TalentralLogo } from '@/components/logo';
import { currentUser } from '@/lib/auth';
import { env } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { logoUrl } from '@/lib/hubs';
import { PrintButton } from '@/app/dashboard/[hub]/reports/print-button';
import { RevokeForm } from './revoke-form';

type Cert = { serial: string; learner_name: string; programme_title: string; cohort_name: string; hub_name: string; hub_slug: string; track: string | null;
  attendance: string | null; score: string | null; completed_on: string; partners: PartnerSnapshot[]; issued_at: Date; revoked_at: Date | null; revoked_reason: string | null };

// Certificates carry a person's name: keep them out of search engines.
export async function generateMetadata({ params }: { params: Promise<{ serial: string }> }): Promise<Metadata> {
  const { serial } = await params;
  return { title: `Certificate ${decodeURIComponent(serial).toUpperCase()}`, robots: { index: false, follow: false } };
}

async function load(serial: string) {
  if (!CERTIFICATE_PATTERN.test(serial)) return null;
  return withUser(null, async (tx) => {
    const [c] = await tx<Cert[]>`select serial, learner_name, programme_title, cohort_name, hub_name, hub_slug, track, attendance, score, completed_on::text, partners, issued_at, revoked_at, revoked_reason from app.verify_certificate(${serial})`;
    if (!c) return null;
    const [t] = await tx<{ slug: string; logo_path: string | null }[]>`select slug, logo_path from public.tenants where slug = ${c.hub_slug}`;
    return { c, logo: t ? logoUrl(t) : null };
  });
}

export default async function Certificate({ params }: { params: Promise<{ serial: string }> }) {
  const serial = decodeURIComponent((await params).serial).toUpperCase();
  const data = await load(serial);
  if (!data) notFound();
  const { c, logo } = data;
  const url = `${env.appUrl}/verify/${c.serial}`;
  const qr = await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#101733', light: '#0000' } });

  // Owners and admins of the issuing hub can withdraw a certificate from here.
  const user = await currentUser();
  const [role] = user ? await withUser(user.id, (tx) => tx<{ role: string }[]>`
    select m.role from public.memberships m join public.tenants t on t.id = m.tenant_id where t.slug = ${c.hub_slug} and m.user_id = ${user.id}`) : [];
  const canRevoke = !c.revoked_at && (role?.role === 'owner' || role?.role === 'admin');

  return (
    <main id="main" tabIndex={-1} className="min-h-dvh bg-canvas print:bg-white">
      <style>{'@page { size: A4 landscape; margin: 0; }'}</style>
      <div className="brand-rule print:hidden" />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 print:max-w-none print:p-0">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <TalentralLogo height={26} />
          <PrintButton />
        </div>

        {c.revoked_at ? (
          <div role="status" className="mb-6 rounded-[var(--radius-card)] border border-danger/30 bg-danger-50 p-5 text-danger print:hidden">
            <p className="font-display text-xl font-semibold">This certificate has been revoked</p>
            <p className="mt-1 text-[15px]">{c.hub_name} withdrew it on {formatDate(c.revoked_at)}. Reason: {c.revoked_reason}</p>
          </div>
        ) : (
          <div role="status" className="mb-6 flex items-start gap-4 rounded-[var(--radius-card)] border border-teal/30 bg-teal-50 p-5 print:hidden">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-700 text-lg text-white" aria-hidden>✓</span>
            <div>
              <p className="font-display text-xl font-semibold text-teal-700">Verified: this certificate is genuine</p>
              <p className="mt-0.5 text-[15px] text-teal-700">Issued by {c.hub_name} through Talentral on {formatDate(c.issued_at)} to {c.learner_name}.</p>
            </div>
          </div>
        )}

        {/* The certificate: A4 landscape proportions, prints edge to edge. */}
        <article className={`relative mx-auto aspect-[297/210] w-full overflow-hidden rounded-[6px] bg-white shadow-[0_20px_60px_-20px_rgba(16,23,51,0.35)] print:h-[210mm] print:w-[297mm] print:rounded-none print:shadow-none ${c.revoked_at ? 'opacity-60' : ''}`}>
          <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_100%_0%,rgba(124,58,237,0.07),transparent),radial-gradient(50%_50%_at_0%_100%,rgba(20,184,166,0.07),transparent)]" />
          <div className="absolute inset-x-0 top-0 h-[1.6%] bg-[linear-gradient(90deg,#7C3AED,#2E5BFF,#14B8A6)]" />
          <div className="absolute inset-[3.2%] rounded-[4px] border border-line" />
          <div className="absolute inset-[3.9%] rounded-[3px] border border-line/70" />

          <div className="relative flex h-full flex-col px-[8%] pb-[6%] pt-[7%] text-center [container-type:inline-size]">
            <div className="flex items-start justify-between">
              {logo ? <img src={logo} alt={`${c.hub_name} logo`} className="h-[9cqw] max-h-16 w-auto max-w-[22%] object-contain" /> : <span className="font-display text-[2.2cqw] font-semibold">{c.hub_name}</span>}
              <span className="block w-[14cqw] [&_img]:h-auto [&_img]:w-full"><TalentralLogo height={26} href={null} /></span>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center">
              <p className="text-[1.5cqw] font-bold uppercase tracking-[0.35em] text-violet">Certificate of completion</p>
              <p className="mt-[2.5cqw] text-[1.7cqw] text-muted">This certifies that</p>
              <p className="mt-[1cqw] font-display text-[5.2cqw] font-semibold leading-tight text-ink">{c.learner_name}</p>
              <div className="mx-auto mt-[1.2cqw] h-px w-[40%] bg-[linear-gradient(90deg,transparent,#C7CCE0,transparent)]" />
              <p className="mt-[1.6cqw] text-[1.7cqw] text-muted">has successfully completed</p>
              <p className="mt-[0.8cqw] font-display text-[2.8cqw] font-semibold text-ink">{c.programme_title}</p>
              <p className="mt-[0.6cqw] text-[1.6cqw] text-muted">{c.cohort_name}{c.track ? ` · ${c.track}` : ''} · {c.hub_name}</p>
              <div className="mt-[2.4cqw] flex flex-wrap justify-center gap-x-[4cqw] gap-y-2 text-[1.5cqw]">
                {c.attendance !== null && <span><span className="block font-display text-[2.4cqw] font-semibold text-ink">{Number(c.attendance)}%</span><span className="text-muted">attendance</span></span>}
                {c.score !== null && <span><span className="block font-display text-[2.4cqw] font-semibold text-ink">{Number(c.score)}%</span><span className="text-muted">assessment score</span></span>}
                <span><span className="block font-display text-[2.4cqw] font-semibold text-ink">{formatDate(c.completed_on)}</span><span className="text-muted">completed</span></span>
              </div>
            </div>

            {c.partners.length > 0 && (
              <div className="mb-[2.2cqw]">
                <p className="text-[0.95cqw] font-bold uppercase tracking-[0.3em] text-muted">Supported by</p>
                <ul className="mt-[1cqw] flex flex-wrap items-center justify-center gap-x-[3.2cqw] gap-y-[1cqw]">
                  {c.partners.map((p, i) => (
                    <li key={i} title={`${p.name} · ${PARTNER_ROLES[p.role] ?? 'Partner'}`} className="flex h-[4.6cqw] max-w-[20cqw] items-center">
                      <img src={`/verify/${c.serial}/partners/${i}`} alt={`${p.name} (${PARTNER_ROLES[p.role] ?? 'Partner'})`} className="max-h-full max-w-full object-contain" />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-end justify-between gap-6 text-left">
              <div className="text-[1.3cqw] leading-snug text-muted">
                <p className="font-semibold text-ink">{c.hub_name}</p>
                <p>Issued {formatDate(c.issued_at)} through Talentral</p>
              </div>
              <div className="flex items-end gap-3 text-right">
                <div className="text-[1.05cqw] leading-tight text-muted">
                  <p className="font-semibold text-ink">Scan to verify</p>
                  <p className="font-mono">{c.serial}</p>
                  <p>{url.replace(/^https?:\/\//, '').replace(/\/verify\/.*/, '/verify')}</p>
                </div>
                <div className="size-[10cqw] shrink-0 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR code linking to this verification page" role="img" />
              </div>
            </div>
          </div>
          {c.revoked_at && <div className="absolute inset-0 flex items-center justify-center"><span className="-rotate-12 rounded-lg border-4 border-danger px-8 py-3 font-display text-6xl font-bold uppercase tracking-widest text-danger/80">Revoked</span></div>}
        </article>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm text-muted print:hidden">
          <p>Certificate number <span className="font-mono font-semibold text-ink">{c.serial}</span> · <Link href="/verify" className="font-semibold text-blue hover:underline">Verify another</Link></p>
          {canRevoke && <RevokeForm slug={c.hub_slug} serial={c.serial} />}
        </div>
        <p className="mt-3 text-[13px] text-muted print:hidden">
          Systems can check this certificate automatically at <a href={`/api/v1/public/credentials/${c.serial}`} className="break-all font-mono text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">/api/v1/public/credentials/{c.serial}</a>.
        </p>
      </div>
    </main>
  );
}
