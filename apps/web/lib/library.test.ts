import { describe, expect, it } from 'vitest';
import { hausaLabel, libraryNewer, studyTime } from './library';

describe('course library labels', () => {
  it('rounds study time for browsing', () => {
    expect(studyTime(45)).toBe('45 min');
    expect(studyTime(60)).toBe('1 hour');
    expect(studyTime(725)).toBe('12 hours');
  });
  it('says how much is in Hausa', () => {
    expect(hausaLabel({ hausa: 0, lessons: 10 })).toBeNull();
    expect(hausaLabel({ hausa: 4, lessons: 10 })).toBe('Hausa in part');
    expect(hausaLabel({ hausa: 10, lessons: 10 })).toBe('English and Hausa');
    expect(hausaLabel({ hausa: 0, lessons: 0 })).toBeNull();
  });
  it('spots a newer library version', () => {
    expect(libraryNewer('2026-10-02', '2026-10-01')).toBe(true);
    expect(libraryNewer('2026-10-01', '2026-10-02')).toBe(false);
    expect(libraryNewer(null, '2026-10-02')).toBe(false);
  });
});
