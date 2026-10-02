// The scheduled job. Sends class reminders (the day before, outside quiet hours, and about 30
// minutes before; texts by WhatsApp or SMS), nudges inactive learners (lib/nudges.ts) and asks
// employers for 90-day retention checks (lib/placements.ts). Called every few minutes by the
// database scheduler and daily by Vercel Cron, with the shared CRON_SECRET. Every message is claimed
// before sending, so overlapping calls never send twice.
import { system } from '@talentral/db';
import { reminderDue, watTime, type ReminderKind } from '@talentral/domain';
import { BRAND_COLUMNS, brandOf, type BrandColumns } from '@/lib/brand';
import { env } from '@/lib/env';
import { classReminderMail, sendMailBatch } from '@/lib/mail';
import { runNudges } from '@/lib/nudges';
import { runRetentionChecks } from '@/lib/placements';
import { optedInNumbers, sendTexts, textingEnabled } from '@/lib/texts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Due = { id: string; title: string; starts_at: Date; mode: string; location: string | null; meeting_url: string | null; hub_name: string; reply_to: string | null } & BrandColumns;
type Learner = { email: string; phone: string; full_name: string; language: 'en' | 'ha' };

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorised', { status: 401 });
  const sql = system();
  const now = new Date();
  const sent = { day: 0, soon: 0, emails: 0, texts: 0, whatsapp: 0 };

  for (const kind of ['soon', 'day'] as ReminderKind[]) {
    const column = kind === 'day' ? 'reminded_day_at' : 'reminded_soon_at';
    const candidates = await sql<Due[]>`
      select s.id, s.title, s.starts_at, s.mode, s.location, s.meeting_url, t.name as hub_name, t.contact_email as reply_to, ${sql.unsafe(BRAND_COLUMNS)}
      from public.class_sessions s join public.tenants t on t.id = s.tenant_id
      where t.status = 'active' and ${sql(column)} is null and s.starts_at > now() and s.starts_at <= now() + interval '26 hours'`;
    for (const s of candidates.filter((c) => reminderDue(kind, new Date(c.starts_at), now))) {
      // Claim it first; if another run got there, skip.
      const claimed = await sql`update public.class_sessions set ${sql(column)} = now() where id = ${s.id} and ${sql(column)} is null returning id`;
      if (!claimed.length) continue;
      const learners = await sql<Learner[]>`
        select a.email::text, a.phone, a.full_name, coalesce(u.language, 'en') as language
        from public.enrolments e join public.applications a on a.id = e.application_id left join public.users u on u.email = a.email
        where e.cohort_id = (select cohort_id from public.class_sessions where id = ${s.id}) and e.status <> 'dropped'`;
      const online = s.mode !== 'in_person' && Boolean(s.meeting_url);
      const info = { title: s.title, when: watTime(new Date(s.starts_at)), where: s.mode === 'online' ? 'Online' : s.location ?? 'At the hub', online };
      sent.emails += await sendMailBatch(learners.map((l) => classReminderMail(l.email, l.full_name, brandOf(s.hub_name, s), kind, info, `${env.appUrl}/learn`)))
        .catch((e) => { console.error('reminder emails failed', e); return 0; });
      if (textingEnabled()) {
        // Each learner gets the text in the language they read Talentral in: by WhatsApp if they
        // chose it, otherwise by SMS.
        const clock = info.when.split(' ').slice(-1)[0];
        const text = (language: 'en' | 'ha') => (language === 'ha'
          ? kind === 'soon' ? `${s.hub_name}: za a fara "${s.title}" da ƙarfe ${clock}. ${online ? 'Shiga ta talentral.ng/learn' : 'Sai mun gan ka.'}`
            : `${s.hub_name}: tunatarwa, "${s.title}" zai kasance ${info.when}.`
          : kind === 'soon' ? `${s.hub_name}: "${s.title}" starts at ${clock}. ${online ? 'Join from talentral.ng/learn' : 'See you there.'}`
            : `${s.hub_name}: reminder, "${s.title}" is on ${info.when}.`);
        const optedIn = await optedInNumbers(learners.map((l) => l.phone));
        const r = await sendTexts(learners.map((l) => ({ phone: l.phone, language: l.language, hub: s.hub_name, text: text(l.language) })), optedIn);
        sent.texts += r.sms;
        sent.whatsapp += r.whatsapp;
      }
      sent[kind] += 1;
    }
  }
  // The test suite can run nudges at a chosen moment; production always uses the real clock.
  const at = process.env.CRON_ALLOW_CLOCK === '1' ? new URL(req.url).searchParams.get('at') : null;
  const nudges = await runNudges(at ? new Date(at) : now).catch((e) => { console.error('nudges failed', e); return null; });
  const retention = await runRetentionChecks(at ? new Date(at) : now).catch((e) => { console.error('retention checks failed', e); return null; });
  return Response.json({ ok: true, at: now.toISOString(), ...sent, nudges, retention });
}
