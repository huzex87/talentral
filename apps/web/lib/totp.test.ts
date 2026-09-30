import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, codeAt, hashRecovery, matchStep, newRecoveryCodes, newSecret, normaliseRecovery, otpauthUrl, stepAt } from './totp';

// RFC 6238 appendix B uses the ASCII secret "12345678901234567890" with SHA-1.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('base32', () => {
  it('round-trips and matches the RFC 4648 vectors', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
    expect(base32Decode('mzxw 6ytb-oi').toString()).toBe('foobar');
    const s = newSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(s))).toBe(s);
  });
});

describe('codes', () => {
  it('match the RFC 6238 test vectors (last six digits)', () => {
    expect(codeAt(RFC_SECRET, stepAt(59_000))).toBe('287082');
    expect(codeAt(RFC_SECRET, stepAt(1_111_111_109_000))).toBe('081804');
    expect(codeAt(RFC_SECRET, stepAt(1_234_567_890_000))).toBe('005924');
    expect(codeAt(RFC_SECRET, stepAt(2_000_000_000_000))).toBe('279037');
  });

  it('accept one step of clock drift either way, and never the same step twice', () => {
    const now = 1_234_567_890_000;
    const step = stepAt(now);
    expect(matchStep(RFC_SECRET, codeAt(RFC_SECRET, step), now)).toBe(step);
    expect(matchStep(RFC_SECRET, codeAt(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(matchStep(RFC_SECRET, codeAt(RFC_SECRET, step + 1), now)).toBe(step + 1);
    expect(matchStep(RFC_SECRET, codeAt(RFC_SECRET, step - 2), now)).toBeNull();
    expect(matchStep(RFC_SECRET, codeAt(RFC_SECRET, step), now, step)).toBeNull();
    expect(matchStep(RFC_SECRET, '12345', now)).toBeNull();
    expect(matchStep(RFC_SECRET, 'abcdef', now)).toBeNull();
  });

  it('builds the link authenticator apps scan', () => {
    const url = otpauthUrl('ABC', 'amina@kirkira.ng');
    expect(url).toBe('otpauth://totp/Talentral%3Aamina%40kirkira.ng?secret=ABC&issuer=Talentral&algorithm=SHA1&digits=6&period=30');
  });
});

describe('recovery codes', () => {
  it('are ten readable, distinct, single-format codes', () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });
  it('accept any spacing or case and hash consistently', () => {
    expect(normaliseRecovery(' 7k3q m9px ')).toBe('7K3Q-M9PX');
    expect(normaliseRecovery('7K3QM9P')).toBe('');
    expect(hashRecovery('7K3Q-M9PX')).toBe(hashRecovery(normaliseRecovery('7k3q-m9px')));
  });
});
