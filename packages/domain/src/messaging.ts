// Composing bulk messages: personalisation placeholders and SMS length, which decides cost
// (Nigerian networks bill per 160-character GSM segment; any non-GSM character such as an emoji or
// a Hausa hooked letter switches the whole message to 70-character Unicode segments).

export const PLACEHOLDERS = {
  '{first_name}': 'First name',
  '{full_name}': 'Full name',
  '{reference}': 'Application reference',
  '{programme}': 'Programme title',
  '{hub}': 'Hub name',
} as const;

export interface Recipient { full_name: string; reference: string; programme: string; hub: string }

export function personalise(template: string, r: Recipient): string {
  const first = r.full_name.trim().split(/\s+/)[0] ?? r.full_name;
  return template
    .replaceAll('{first_name}', first)
    .replaceAll('{full_name}', r.full_name)
    .replaceAll('{reference}', r.reference)
    .replaceAll('{programme}', r.programme)
    .replaceAll('{hub}', r.hub);
}

export const hasPlaceholders = (s: string) => Object.keys(PLACEHOLDERS).some((p) => s.includes(p));

// GSM 03.38 basic set plus the extension characters that cost two slots.
const GSM = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€';

export function smsSegments(text: string): { chars: number; segments: number; unicode: boolean } {
  let units = 0;
  let unicode = false;
  for (const ch of text) {
    if (GSM.includes(ch)) units += 1;
    else if (GSM_EXT.includes(ch)) units += 2;
    else { unicode = true; break; }
  }
  if (unicode) {
    const chars = [...text].length;
    return { chars, unicode, segments: chars <= 70 ? 1 : Math.ceil(chars / 67) };
  }
  return { chars: units, unicode, segments: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153) };
}

export const MAX_SMS_SEGMENTS = 4;
