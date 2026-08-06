import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startFactCycler, shuffledIndices } from './fact-cycler';

describe('shuffledIndices', () => {
  it('returns every index exactly once', () => {
    const result = shuffledIndices(19, () => 0.5);
    expect(result.slice().sort((a, b) => a - b)).toEqual(Array.from({ length: 19 }, (_, i) => i));
  });
});

describe('startFactCycler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does nothing before the hold period elapses, then fades out, advances, and fades back in', () => {
    const events: string[] = [];
    let currentIndex = 0;
    startFactCycler(
      5,
      0,
      {
        onFadeOut: () => events.push('fadeout'),
        onNext: (i) => {
          currentIndex = i;
          events.push(`next:${i}`);
        },
        onFadeIn: () => events.push('fadein'),
      },
      () => 0.9, // deterministic: near-max hold time, deterministic shuffle
    );

    vi.advanceTimersByTime(7000);
    expect(events).toEqual([]);

    vi.advanceTimersByTime(1000);
    expect(events).toEqual(['fadeout']);

    vi.advanceTimersByTime(700);
    expect(events).toHaveLength(3);
    expect(events[1]).toMatch(/^next:/);
    expect(events[2]).toBe('fadein');
    expect(currentIndex).not.toBe(0);
  });

  it('keeps cycling through multiple rounds without repeating the same index twice in a row', () => {
    const seen: number[] = [0];
    startFactCycler(
      4,
      0,
      {
        onFadeOut: () => {},
        onNext: (i) => seen.push(i),
        onFadeIn: () => {},
      },
      () => 0.42,
    );

    vi.advanceTimersByTime(8650 * 6);

    expect(seen.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).not.toBe(seen[i - 1]);
    }
  });

  it('stops scheduling further cycles once the returned cleanup runs', () => {
    const onNext = vi.fn();
    const stop = startFactCycler(5, 0, { onFadeOut: () => {}, onNext, onFadeIn: () => {} }, () => 0.9);
    stop();
    vi.advanceTimersByTime(20000);
    expect(onNext).not.toHaveBeenCalled();
  });
});
