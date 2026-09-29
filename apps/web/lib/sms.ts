import 'server-only';
// Outgoing SMS. Drivers: console (development), file (tests read .sms/*.json), termii (production).
// Termii is a Nigerian provider; it needs an approved sender ID, and the "dnd" channel reaches
// numbers on the Do-Not-Disturb register for transactional messages.
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface Sms { to: string; text: string }

const driver = () => (process.env.SMS_DRIVER ?? 'console') as 'console' | 'file' | 'termii';
const termii = () => ({
  base: (process.env.TERMII_BASE_URL ?? 'https://v3.api.termii.com').replace(/\/$/, ''),
  key: process.env.TERMII_API_KEY ?? '',
  from: process.env.TERMII_SENDER_ID ?? 'Talentral',
  channel: process.env.TERMII_CHANNEL ?? 'generic',
});

export const smsEnabled = () => driver() !== 'termii' || Boolean(process.env.TERMII_API_KEY);

// Termii wants international format without the plus: 2348031234567.
const digits = (phone: string) => phone.replace(/[^\d]/g, '');

async function post(path: string, body: Record<string, unknown>): Promise<boolean> {
  const t = termii();
  const res = await fetch(`${t.base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, from: t.from, type: 'plain', channel: t.channel, api_key: t.key }),
  });
  if (!res.ok) console.error(`SMS failed (${res.status}): ${await res.text()}`);
  return res.ok;
}

async function record(messages: Sms[]) {
  if (driver() === 'file') {
    const dir = join(process.cwd(), '.sms');
    await mkdir(dir, { recursive: true });
    for (const m of messages) await writeFile(join(dir, `${Date.now()}-${randomBytes(3).toString('hex')}-${digits(m.to)}.json`), JSON.stringify(m));
  } else {
    for (const m of messages) console.info(`[sms] to ${m.to}: ${m.text}`);
  }
}

// Sends many messages and returns how many the provider accepted. Identical texts go in bulk
// requests of up to 1,000 numbers; personalised texts go one by one, five at a time.
export async function sendSmsBatch(messages: Sms[]): Promise<number> {
  const valid = messages.filter((m) => digits(m.to).length >= 10);
  if (driver() !== 'termii') { await record(valid); return valid.length; }

  const sameText = valid.every((m) => m.text === valid[0]?.text);
  let sent = 0;
  if (sameText && valid.length > 1) {
    for (let i = 0; i < valid.length; i += 1000) {
      const chunk = valid.slice(i, i + 1000);
      if (await post('/api/sms/send/bulk', { to: chunk.map((m) => digits(m.to)), sms: chunk[0]!.text }).catch(() => false)) sent += chunk.length;
    }
    return sent;
  }
  for (let i = 0; i < valid.length; i += 5) {
    const results = await Promise.all(valid.slice(i, i + 5).map((m) => post('/api/sms/send', { to: digits(m.to), sms: m.text }).catch(() => false)));
    sent += results.filter(Boolean).length;
  }
  return sent;
}
