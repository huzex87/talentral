import { TalentralLogo } from './logo';
import { Card } from './ui';

export function AuthShell({ title, subtitle, lang, aside, children }: {
  title: string; subtitle?: string; lang?: 'en' | 'ha'; aside?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <main id="main" tabIndex={-1} className="flex min-h-dvh flex-col" lang={lang}>
      <div className="brand-rule" />
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center"><TalentralLogo height={30} /></div>
          <Card className="p-6 sm:p-8">
            <h1 className="text-2xl font-semibold">{title}</h1>
            {subtitle && <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </Card>
          {aside && <div className="mt-4 flex justify-center">{aside}</div>}
        </div>
      </div>
    </main>
  );
}
