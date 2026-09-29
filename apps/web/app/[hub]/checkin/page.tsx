import { LanguageToggle } from '@/components/language-toggle';
import { visitorLanguage } from '@/lib/i18n';
import { CheckinForm } from './checkin-form';

export const metadata = { title: 'Check in', robots: { index: false } };

export default async function Checkin({ params }: { params: Promise<{ hub: string }> }) {
  const { hub } = await params;
  const lang = await visitorLanguage();
  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:py-16" lang={lang}>
      <CheckinForm hub={hub} lang={lang} />
      <div className="mt-4 flex justify-center"><LanguageToggle language={lang} /></div>
    </div>
  );
}
