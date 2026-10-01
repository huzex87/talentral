import 'server-only';
import type { Tx } from '@talentral/db';

export interface WhatsAppChoice { phones: string[]; state: 'on' | 'off' | 'undecided'; changedAt: Date | null }

// The person's numbers and their WhatsApp choice: on if any number chose it, off if every number
// said no, otherwise not decided yet. Null when Talentral has no Nigerian mobile number for them.
export async function myWhatsApp(tx: Tx): Promise<WhatsAppChoice | null> {
  const rows = await tx<{ phone: string; opted_in: boolean | null; changed_at: Date | null }[]>`select * from app.my_whatsapp()`;
  if (!rows.length) return null;
  const state = rows.some((r) => r.opted_in) ? 'on' : rows.every((r) => r.opted_in === false) ? 'off' : 'undecided';
  const changed = rows.map((r) => r.changed_at).filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return { phones: rows.map((r) => r.phone), state, changedAt: changed };
}

// 2348031234567 -> 0803 ••• 4567
export const maskPhone = (p: string) => `0${p.slice(3, 6)} ••• ${p.slice(-4)}`;
