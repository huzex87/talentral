import Link from 'next/link';
import { withUser } from '@talentral/db';
import { JOB_TYPES, JOB_TYPES_HA, WORK_MODES, WORK_MODES_HA, payRange, type JobType, type WorkMode } from '@talentral/domain';
import { AuthShell } from '@/components/auth-shell';
import { buttonClass } from '@/components/ui';
import { hashToken } from '@/lib/tokens';
import { ReplyButtons } from './reply-buttons';

export const metadata = { title: 'Answer an invitation', robots: { index: false } };

type Link_ = { first_name: string; language: 'en' | 'ha'; role_title: string; employer: string; work_mode: WorkMode; job_type: JobType;
  state: string | null; pay_min: number | null; pay_max: number | null; interest: 'pending' | 'confirmed' | 'declined'; stage: string; answered: boolean };

// The page a candidate reaches from the email, WhatsApp or SMS about a role: what the role is, and
// yes or no in one tap. No sign-in and no personal details beyond their first name.
export default async function ReplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[A-Za-z0-9_-]{20,100}$/.test(token);
  const [link] = valid ? await withUser(null, (tx) => tx<Link_[]>`select * from app.reply_link(${hashToken(token)})`) : [];
  if (!link) {
    return (
      <AuthShell title="This link has expired" subtitle="Links to answer a role last 14 days. Sign in to see every opportunity on your Passport and answer there.">
        <Link href="/sign-in?next=/passport" className={buttonClass('primary') + ' w-full'}>Sign in</Link>
        <p className="mt-4 text-sm text-muted" lang="ha">Wannan hanyar haɗi ta ƙare. Shiga don ganin damarmaki a Fasfonka.</p>
      </AuthShell>
    );
  }
  const ha = link.language === 'ha';
  const t = (en: string, h: string) => (ha ? h : en);
  const pay = payRange(link.pay_min, link.pay_max);
  const details = [
    ha ? WORK_MODES_HA[link.work_mode] : WORK_MODES[link.work_mode],
    ha ? JOB_TYPES_HA[link.job_type] : JOB_TYPES[link.job_type],
    link.state,
  ].filter(Boolean).join(' · ');
  const greeting = link.first_name ? t(`${link.first_name}, `, `${link.first_name}, `) : '';

  return (
    <AuthShell lang={link.language} title={t(`${greeting}are you interested?`, `${greeting}kana so?`)}
      subtitle={t('Answer in one tap. Nothing is shared with the employer until you say yes.', 'Amsa da taɓawa ɗaya. Ba a raba komai da mai ɗaukar aiki sai ka ce eh.')}>
      <div className="rounded-xl border border-line bg-canvas p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">{link.employer}</p>
        <p className="mt-1 font-display text-lg font-semibold leading-snug">{link.role_title}</p>
        <p className="mt-1 text-sm text-muted">{details}</p>
        {pay && <p className="mt-1 text-sm font-medium">{pay}</p>}
      </div>
      <div className="mt-5">
        <ReplyButtons token={token} lang={link.language} employer={link.employer} current={link.answered ? link.interest : 'pending'} placed={link.stage === 'placed'} />
      </div>
      <p className="mt-6 border-t border-line pt-4 text-xs leading-relaxed text-muted">
        {t('Your Passport, contact details and work stay private until you say yes and allow sharing with employers. ', 'Fasfonka da bayanan tuntuɓarka suna sirri har sai ka ce eh kuma ka ba da izinin raba su. ')}
        <Link href="/passport" className="font-semibold text-blue underline underline-offset-2">{t('Open my Passport', 'Buɗe Fasfona')}</Link>
      </p>
    </AuthShell>
  );
}
