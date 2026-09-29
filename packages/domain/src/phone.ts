// Nigerian mobile numbers for phone sign-in. Numbers are stored in one form, 234 followed by the
// ten-digit national number (2348031234567), so "0803 123 4567", "+234 803 123 4567" and
// "803-123-4567" all match the same learner.

// Mobile numbers start 70, 71, 80, 81, 90 or 91 after the leading zero.
const MOBILE = /^[789][01]\d{8}$/;

export function normalizePhone(input: string | null | undefined): string | null {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.startsWith('00234')) d = d.slice(5);
  else if (d.startsWith('234')) d = d.slice(3);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return MOBILE.test(d) ? `234${d}` : null;
}

// For screens: "0803 *** 4567", so a code is never shown next to a full number.
export function maskPhone(phone: string): string {
  const national = `0${phone.replace(/^234/, '')}`;
  return `${national.slice(0, 4)} *** ${national.slice(-4)}`;
}

// For people: "0803 123 4567".
export function formatPhone(phone: string): string {
  const n = `0${phone.replace(/^234/, '')}`;
  return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
}

export const PHONE_CODE_LENGTH = 6;
export const PHONE_CODE_MINUTES = 10;
export const PHONE_CODE_TRIES = 5;

export function isPhoneCode(input: string): boolean {
  return new RegExp(`^\\d{${PHONE_CODE_LENGTH}}$`).test(input);
}

export function phoneCodeText(code: string, language: 'en' | 'ha'): string {
  return language === 'ha'
    ? `Lambar shiga Talentral: ${code}. Za ta daina aiki bayan minti ${PHONE_CODE_MINUTES}. Kada ka ba kowa ita.`
    : `Your Talentral sign-in code is ${code}. It expires in ${PHONE_CODE_MINUTES} minutes. Never share it with anyone.`;
}
