import 'server-only';
// Short messages to learners and applicants: by WhatsApp for people who chose it, by SMS for
// everyone else. Callers pass the set of numbers that opted in (hub screens get it from
// app.whatsapp_audience, the scheduler from optedInNumbers).
import { system } from '@talentral/db';
import { waPhone, type Language } from '@talentral/domain';
import { sendSmsBatch, smsEnabled } from './sms';
import { sendWhatsAppBatch, whatsappEnabled } from './whatsapp';

export interface Text { phone: string | null | undefined; language: Language; hub: string; text: string }
export interface TextResult { whatsapp: number; sms: number }

// SMS texts start with the hub's name ("Kirkira: ..."); the WhatsApp template adds it itself.
const withoutHub = (text: string, hub: string) => (text.startsWith(`${hub}: `) ? text.slice(hub.length + 2) : text);

export async function sendTexts(texts: Text[], optedIn: ReadonlySet<string>): Promise<TextResult> {
  const wa: Text[] = [];
  const sms: Text[] = [];
  for (const t of texts) {
    const n = waPhone(t.phone);
    if (!t.phone) continue;
    if (n && optedIn.has(n) && whatsappEnabled()) wa.push(t); else sms.push(t);
  }
  const [whatsapp, texted] = await Promise.all([
    wa.length ? sendWhatsAppBatch(wa.map((t) => ({ to: t.phone!, kind: 'update' as const, language: t.language, hub: t.hub, text: withoutHub(t.text, t.hub) }))).catch((e) => { console.error('whatsapp failed', e); return 0; }) : 0,
    sms.length && smsEnabled() ? sendSmsBatch(sms.map((t) => ({ to: t.phone!, text: t.text.slice(0, 300) }))).catch((e) => { console.error('sms failed', e); return 0; }) : 0,
  ]);
  return { whatsapp, sms: texted };
}

export const textingEnabled = () => smsEnabled() || whatsappEnabled();

// For the scheduler and sign-in only (system connection): which of these numbers chose WhatsApp.
export async function optedInNumbers(phones: (string | null | undefined)[]): Promise<Set<string>> {
  const numbers = [...new Set(phones.map((p) => waPhone(p)).filter((p): p is string => Boolean(p)))];
  if (!numbers.length) return new Set();
  const rows = await system()<{ phone: string }[]>`select phone from public.whatsapp_optins where opted_in and phone = any(${numbers}::text[])`;
  return new Set(rows.map((r) => r.phone));
}
