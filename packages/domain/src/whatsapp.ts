// WhatsApp messages (MVP-1 S4). Businesses may start a WhatsApp conversation only with an approved
// template and the person's permission, so every Talentral message goes out through one "update"
// template ("Message from {{1}}: {{2}} ...") and sign-in codes through an authentication template.
// Pure helpers, so the rules are covered by tests.

// A template parameter may not contain new lines, tabs or more than four spaces in a row, and the
// whole message stays under WhatsApp's 1,024-character body limit.
export function waParam(text: string, max = 900): string {
  const flat = text.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

// A Nigerian mobile number as WhatsApp wants it: 234XXXXXXXXXX. Mirrors app.wa_phone in SQL.
export function waPhone(raw: string | null | undefined): string | null {
  const d = (raw ?? '').replace(/\D/g, '');
  if (/^234[789][01]\d{8}$/.test(d)) return d;
  if (/^0[789][01]\d{8}$/.test(d)) return `234${d.slice(1)}`;
  if (/^[789][01]\d{8}$/.test(d)) return `234${d}`;
  return null;
}

// Replies that turn WhatsApp messages off or back on, in English and Hausa.
const STOP = ['stop', 'unsubscribe', 'cancel', 'tsaya', 'daina', 'dakata'];
const START = ['start', 'subscribe', 'fara', 'ci gaba'];

export function whatsappKeyword(text: string): 'stop' | 'start' | null {
  const t = text.trim().toLowerCase().replace(/[.!]+$/, '');
  if (STOP.includes(t)) return 'stop';
  if (START.includes(t)) return 'start';
  return null;
}

export function whatsappReply(kind: 'stop' | 'start', language: 'en' | 'ha'): string {
  if (kind === 'stop') {
    return language === 'ha'
      ? 'Ba za ka ƙara samun saƙonnin WhatsApp daga Talentral ba. Aika FARA idan kana son su dawo. Za ka iya samun SMS da imel har yanzu.'
      : 'You will no longer get WhatsApp messages from Talentral. Reply START to turn them back on. You may still get SMS and email.';
  }
  return language === 'ha'
    ? 'Za ka samu tunatarwar aji da saƙonni daga cibiyarka a WhatsApp. Aika TSAYA don dakatarwa.'
    : 'You will get class reminders and messages from your hub on WhatsApp. Reply STOP at any time to stop.';
}
