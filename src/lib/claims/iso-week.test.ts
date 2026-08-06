import { describe, it, expect } from 'vitest';
import { getISOWeekKey } from './iso-week';

describe('getISOWeekKey', () => {
  it('produces the same key for two dates in the same ISO week', () => {
    const monday = new Date('2026-07-20T09:00:00Z');
    const friday = new Date('2026-07-24T18:00:00Z');
    expect(getISOWeekKey(monday)).toBe(getISOWeekKey(friday));
  });

  it('produces a different key across an ISO week boundary', () => {
    const thisWeek = new Date('2026-07-20T09:00:00Z');
    const nextWeek = new Date('2026-07-27T09:00:00Z');
    expect(getISOWeekKey(thisWeek)).not.toBe(getISOWeekKey(nextWeek));
  });

  it('folds ISO year and week into year*100+week', () => {
    // 2026-07-20 is in ISO week 30 of 2026.
    expect(getISOWeekKey(new Date('2026-07-20T09:00:00Z'))).toBe(202630);
  });
});
