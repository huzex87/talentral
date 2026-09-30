import { describe, expect, it } from 'vitest';
import { waParam, waPhone, whatsappKeyword, whatsappReply } from '../src/whatsapp';

describe('WhatsApp helpers', () => {
  it('flattens template parameters and keeps them short', () => {
    expect(waParam('Class moved\n\nto   Room 2\tat 10:00')).toBe('Class moved to Room 2 at 10:00');
    expect(waParam('a'.repeat(50), 10)).toBe(`${'a'.repeat(9)}…`);
  });
  it('writes Nigerian numbers the WhatsApp way, like the database does', () => {
    expect(waPhone('0803 123 4567')).toBe('2348031234567');
    expect(waPhone('+234 (803) 123-4567')).toBe('2348031234567');
    expect(waPhone('8031234567')).toBe('2348031234567');
    expect(waPhone('0603 123 4567')).toBeNull();
    expect(waPhone(null)).toBeNull();
  });
  it('understands STOP and START in English and Hausa', () => {
    expect(whatsappKeyword(' Stop ')).toBe('stop');
    expect(whatsappKeyword('TSAYA!')).toBe('stop');
    expect(whatsappKeyword('fara')).toBe('start');
    expect(whatsappKeyword('stop sending me the timetable')).toBeNull();
    expect(whatsappReply('stop', 'ha')).toContain('FARA');
    expect(whatsappReply('start', 'en')).toContain('STOP');
  });
});
