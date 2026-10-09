import { describe, expect, it } from 'vitest';
import { digestWeek } from './digest';

describe('digestWeek', () => {
  it('waits until 07:00 West Africa Time on Monday', () => {
    // Monday 13 October 2025, 05:30 UTC is 06:30 WAT.
    expect(digestWeek(new Date('2025-10-13T05:30:00Z'))).toEqual({ monday: '2025-10-13', due: false });
    expect(digestWeek(new Date('2025-10-13T06:00:00Z'))).toEqual({ monday: '2025-10-13', due: true });
  });
  it('still sends later in the week if Monday was missed', () => {
    expect(digestWeek(new Date('2025-10-16T12:00:00Z'))).toEqual({ monday: '2025-10-13', due: true });
  });
  it('treats late Sunday night UTC as Monday in Lagos', () => {
    // Sunday 23:30 UTC is Monday 00:30 WAT: the new week, not yet due.
    expect(digestWeek(new Date('2025-10-19T23:30:00Z'))).toEqual({ monday: '2025-10-20', due: false });
  });
});
