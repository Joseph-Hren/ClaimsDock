import { describe, it, expect } from 'vitest';
import { shuffledOrder } from './fact-cycler';

describe('shuffledOrder', () => {
  it('returns every index exactly once', () => {
    const result = shuffledOrder(19, () => 0.5);
    expect(result.slice().sort((a, b) => a - b)).toEqual(Array.from({ length: 19 }, (_, i) => i));
  });

  it('is deterministic for a given random function', () => {
    const fixed = () => 0.3;
    expect(shuffledOrder(19, fixed)).toEqual(shuffledOrder(19, fixed));
  });

  it('produces a different order for a different random function', () => {
    expect(shuffledOrder(19, () => 0.1)).not.toEqual(shuffledOrder(19, () => 0.9));
  });
});
