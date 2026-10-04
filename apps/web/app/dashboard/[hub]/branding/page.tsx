import { DOMAIN_STATUS_LABELS, domainRecords } from '@talentral/domain';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { requireHubRole } from '@/lib/auth';
import { tenantBrand } from '@/lib/brand';
import { domainTarget } from '@/lib/domains';
import { env } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { layoutMail } from '@/lib/mail';
import { hubUrl, liveDomain } from '@/lib/urls';
import { removeDomain } from './actions';
import { CheckDomainButton, CopyValue, DomainForm, EmailBrandForm } from './forms';

export const metadata = { title: 'Domain and emails' };

export default async function Branding({ params }: { params: Promise<{ hub: string }> }) {
  const { hub: slug } = await params;
  const { hub } = await requireHubRole(slug, ['owner', 'admin']);
  const records = hub.custom_domain && hub.domain_token ? domainRecords(hub.custom_domain, hub.domain_token, domainTarget()) : [];
  const live = liveDomain(hub);
  const preview = layoutMail({
    hub: tenantBrand(hub),
    heading: 'Good news: you have been shortlisted',
    paragraphs: ['Dear Amina,', `Your application to <b>Cohort 1</b> at ${hub.name} has been shortlisted.`, 'We will contact you soon about the next step. Please keep your phone on and check your email.'],
    button: { label: 'See my application', url: hubUrl(hub.slug, '', live) },
  }).html;
  const tone = { pending: 'amber', verified: 'teal', failed: 'danger' } as const;

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader label="Settings" title="Domain and emails" description="Make Talentral look like part of your organisation: your own web address for your pages, and emails that come from your hub." />

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Your own domain</h2>
            <p className="mt-1 text-sm text-muted">Your hub page, programmes and application forms open at your domain. Sign-in and learner pages stay on Talentral.</p>
          </div>
          {hub.domain_status && <Badge tone={tone[hub.domain_status]}>{DOMAIN_STATUS_LABELS[hub.domain_status]}</Badge>}
        </div>
        <p className="mt-3 text-sm">Your Talentral address: <a href={hubUrl(hub.slug)} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue underline underline-offset-2">{hubUrl(hub.slug).replace(/^https?:\/\//, '')}</a></p>
        {live && <p className="mt-1 text-sm">Live at: <a href={hubUrl(hub.slug, '', live)} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue underline underline-offset-2">{live}</a> · verified {formatDate(hub.domain_verified_at)}</p>}

        <div className="mt-5"><DomainForm slug={hub.slug} current={hub.custom_domain} /></div>

        {records.length > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className="font-semibold">Add these records at your DNS provider</h3>
            <div className="overflow-x-auto rounded-xl border border-line" tabIndex={0} role="region" aria-label="DNS records">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-line bg-canvas/70 text-xs text-muted font-medium">
                  <tr><th className="px-3 py-2 font-semibold">Type</th><th className="px-3 py-2 font-semibold">Name (host)</th><th className="px-3 py-2 font-semibold">Value</th><th className="px-3 py-2 font-semibold">Why</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {records.map((r) => (
                    <tr key={r.type}>
                      <th scope="row" className="px-3 py-2.5 font-mono text-xs font-semibold">{r.type}</th>
                      <td className="px-3 py-2.5"><span className="flex items-center gap-2"><code className="break-all font-mono text-xs">{r.host}</code><CopyValue value={r.host} label={`${r.type} name`} /></span></td>
                      <td className="px-3 py-2.5"><span className="flex items-center gap-2"><code className="break-all font-mono text-xs">{r.value}</code><CopyValue value={r.value} label={`${r.type} value`} /></span></td>
                      <td className="px-3 py-2.5 text-muted">{r.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hub.domain_error && hub.domain_status === 'failed' && <p className="text-sm text-danger">Last check {formatDate(hub.domain_checked_at, true)}: {hub.domain_error}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CheckDomainButton slug={hub.slug} />
              <form action={removeDomain.bind(null, hub.slug)}><Button variant="ghost" size="sm">Remove domain</Button></form>
            </div>
            <p className="text-xs text-muted">HTTPS is set up automatically once the CNAME record points to Talentral. Changes at your DNS provider can take up to an hour.</p>
          </div>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Emails to applicants and learners</h2>
        <p className="mb-5 mt-1 text-sm text-muted">Decisions, certificates, class reminders, announcements and nudges carry your logo and colour, and come from your hub. Sign-in emails stay from Talentral.</p>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <EmailBrandForm slug={hub.slug} values={hub} hubName={hub.name} contact={hub.contact_email} />
          <div>
            <p className="mb-2 text-[13px] font-medium text-muted">Preview</p>
            <iframe title="Email preview" srcDoc={preview} sandbox="" className="h-[460px] w-full rounded-xl border border-line bg-canvas" />
            <p className="mt-2 text-xs text-muted">From: {(hub.email_from_name || hub.name)} via Talentral &lt;{env.mailFrom.match(/<([^>]+)>/)?.[1] ?? env.mailFrom}&gt;</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
