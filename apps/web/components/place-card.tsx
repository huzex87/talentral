import Link from 'next/link';
import { BadgeCheck, Check, Clock, Mail, Phone } from 'lucide-react';
import { Badge, Card, cx } from '@/components/ui';

export type Place = {
  application_id: string; reference: string; programme_title: string; hub_name: string; hub_slug: string;
  hub_phone: string | null; hub_email: string | null; accepted_at: Date;
};

type T = (en: string, ha: string) => string;

// A place the learner has been accepted for that no cohort has taken them into yet: what is done,
// what to do now (their Passport) and what the hub does next (adding them to a class).
export function PlaceCard({ place, passportReady, t }: { place: Place; passportReady: boolean; t: T }) {
  const hub = place.hub_name;
  const steps: { state: 'done' | 'todo' | 'waiting'; title: string; body: string; action?: { href: string; label: string } }[] = [
    { state: 'done', title: t(`${hub} confirmed your place`, `${hub} ta tabbatar da gurbinka`), body: t('Welcome aboard. Keep your phone on and check your email for joining details.', 'Barka da zuwa. Ka bar wayarka a kunne kuma ka riƙa duba imel ɗinka don cikakken bayani.') },
    {
      state: passportReady ? 'done' : 'todo',
      title: t('Complete your Talentral Passport', 'Kammala Fasfonka na Talentral'),
      body: t('Add a headline and your skills. It holds your verified skills and certificates, and employers see it only if you choose.',
        'Saka taken kai da gwanintarka. Yana ɗauke da gwanintarka da takardun shaida, kuma masu ɗaukar aiki za su gan shi ne kawai idan ka zaɓa.'),
      action: passportReady ? undefined : { href: '/passport', label: t('Open Passport', 'Buɗe Fasfo') },
    },
    { state: 'waiting', title: t('Join your class', 'Shiga ajinka'), body: t(`${hub} adds you to a class before the programme starts. Your course, class times and announcements then appear here, and we email you.`,
      `${hub} za ta saka ka cikin aji kafin a fara shirin. Darussanka, lokutan aji da sanarwa za su bayyana a nan, kuma za mu aiko maka imel.`) },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-4 p-5 sm:p-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-teal/10 text-teal-700" aria-hidden><BadgeCheck className="size-5" strokeWidth={1.75} /></span>
        <div className="min-w-0">
          <Badge tone="teal">{t('Place confirmed', 'An tabbatar da gurbi')}</Badge>
          <h2 className="mt-2 text-lg font-semibold tracking-[-0.01em]">{place.programme_title}</h2>
          <p className="mt-0.5 text-sm text-muted">{hub} · {t('Reference', 'Lambar shaida')} <span className="font-mono text-[13px] text-ink-2">{place.reference}</span></p>
        </div>
      </div>
      <ol className="divide-y divide-line border-t border-line">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-4 px-5 py-4 sm:px-6">
            <span className={cx('mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
              s.state === 'done' ? 'bg-teal-700 text-white' : s.state === 'todo' ? 'bg-blue text-white' : 'border border-line-strong text-muted')} aria-hidden>
              {s.state === 'done' ? <Check className="size-3.5" strokeWidth={2.5} /> : s.state === 'waiting' ? <Clock className="size-3.5" strokeWidth={2} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className={cx('font-medium', s.state === 'done' && 'text-muted')}>{s.title}</p>
                {s.state === 'done' && <span className="text-xs font-medium text-teal-700">{t('Done', 'An gama')}</span>}
                {s.state === 'waiting' && <span className="text-xs font-medium text-muted">{t('Waiting for your hub', 'Ana jiran cibiyarka')}</span>}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
              {s.action && <Link href={s.action.href} className="mt-2 inline-flex text-sm font-medium text-blue hover:underline">{s.action.label} →</Link>}
            </div>
          </li>
        ))}
      </ol>
      {(place.hub_phone || place.hub_email) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line bg-canvas/60 px-5 py-3 text-sm sm:px-6">
          <span className="text-muted">{t('Questions about your place?', 'Kana da tambaya game da gurbinka?')}</span>
          {place.hub_phone && <a href={`tel:${place.hub_phone.replace(/[^+\d]/g, '')}`} className="inline-flex items-center gap-1.5 font-medium text-ink hover:text-blue"><Phone className="size-3.5" aria-hidden strokeWidth={1.75} />{place.hub_phone}</a>}
          {place.hub_email && <a href={`mailto:${place.hub_email}`} className="inline-flex items-center gap-1.5 font-medium text-ink hover:text-blue"><Mail className="size-3.5" aria-hidden strokeWidth={1.75} />{place.hub_email}</a>}
        </div>
      )}
    </Card>
  );
}
