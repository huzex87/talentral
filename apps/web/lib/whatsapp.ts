import 'server-only';
// Outgoing WhatsApp messages through the WhatsApp Business Cloud API (Meta). Drivers: off (the
// default), console (development), file (tests read .whatsapp/*.json) and cloud (production). Business-started
// messages must use approved templates (docs/whatsapp.md): "update" carries a hub's message and
// "code" a sign-in code. Plain text is allowed only as a reply within 24 hours of the person
// writing to us, which the webhook uses to confirm STOP and START.
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { waParam, waPhone, type Language } from '@talentral/domain';

export type WaMessage =
  | { to: string; kind: 'update'; language: Language; hub: string; text: string }
  | { to: string; kind: 'code'; language: Language; code: string }
  | { to: string; kind: 'reply'; text: string };

const driver = () => (process.env.WHATSAPP_DRIVER ?? 'off') as 'off' | 'console' | 'file' | 'cloud';
const cloud = () => ({
  base: (process.env.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v21.0').replace(/\/$/, ''),
  token: process.env.WHATSAPP_TOKEN ?? '',
  phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
  update: process.env.WHATSAPP_TEMPLATE_UPDATE ?? 'talentral_update',
  code: process.env.WHATSAPP_TEMPLATE_CODE ?? 'talentral_code',
  // WhatsApp template language codes; Hausa templates are submitted as "ha".
  lang: { en: process.env.WHATSAPP_LANG_EN ?? 'en', ha: process.env.WHATSAPP_LANG_HA ?? 'ha' } as Record<Language, string>,
});

// Off unless configured, so people who chose WhatsApp keep getting SMS until it is set up.
export const whatsappEnabled = () => driver() === 'console' || driver() === 'file' || (driver() === 'cloud' && Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID));

function payload(m: WaMessage, to: string) {
  const c = cloud();
  if (m.kind === 'reply') return { messaging_product: 'whatsapp', to, type: 'text', text: { body: m.text.slice(0, 4000) } };
  if (m.kind === 'code') {
    return { messaging_product: 'whatsapp', to, type: 'template', template: { name: c.code, language: { code: c.lang[m.language] }, components: [
      { type: 'body', parameters: [{ type: 'text', text: m.code }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: m.code }] },
    ] } };
  }
  return { messaging_product: 'whatsapp', to, type: 'template', template: { name: c.update, language: { code: c.lang[m.language] }, components: [
    { type: 'body', parameters: [{ type: 'text', text: waParam(m.hub, 80) }, { type: 'text', text: waParam(m.text) }] },
  ] } };
}

async function post(body: unknown): Promise<boolean> {
  const c = cloud();
  const res = await fetch(`${c.base}/${c.phoneId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`WhatsApp failed (${res.status}): ${await res.text()}`);
  return res.ok;
}

// Sends each message and returns how many WhatsApp accepted, five at a time.
export async function sendWhatsAppBatch(messages: WaMessage[]): Promise<number> {
  const valid = messages.flatMap((m) => { const to = waPhone(m.to); return to ? [{ m, to }] : []; });
  if (!valid.length || !whatsappEnabled()) return 0;
  if (driver() !== 'cloud') {
    if (driver() === 'file') {
      const dir = join(process.cwd(), '.whatsapp');
      await mkdir(dir, { recursive: true });
      for (const { m, to } of valid) await writeFile(join(dir, `${Date.now()}-${randomBytes(3).toString('hex')}-${to}.json`), JSON.stringify({ ...m, to, payload: payload(m, to) }));
    } else {
      for (const { m, to } of valid) console.info(`[whatsapp] to ${to}: ${JSON.stringify(payload(m, to))}`);
    }
    return valid.length;
  }
  let sent = 0;
  for (let i = 0; i < valid.length; i += 5) {
    const results = await Promise.all(valid.slice(i, i + 5).map(({ m, to }) => post(payload(m, to)).catch(() => false)));
    sent += results.filter(Boolean).length;
  }
  return sent;
}
