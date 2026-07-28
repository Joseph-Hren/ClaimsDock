import { describe, it, expect } from 'vitest';
import { keywordOverlap } from './keyword-overlap';

describe('keywordOverlap', () => {
  it('is 1 when every significant query term appears in the chunk', () => {
    expect(keywordOverlap('what is upcoding', 'Upcoding is filing a claim for a more expensive service.')).toBe(1);
  });

  it('is 0 when no significant query term appears', () => {
    expect(keywordOverlap('what counts as upcoding', 'Deductibles reset each plan year.')).toBe(0);
  });

  it('ignores stopwords and case when matching', () => {
    const score = keywordOverlap('What Does ERISA Require', 'erisa imposes strict deadlines.');
    expect(score).toBeGreaterThan(0);
  });

  it('returns a partial score when only some terms match', () => {
    const score = keywordOverlap('upcoding and unbundling', 'Upcoding is a real category.');
    expect(score).toBeCloseTo(0.5, 5);
  });

  it('returns 0 for an all-stopword query rather than dividing by zero', () => {
    expect(keywordOverlap('what is the', 'anything at all')).toBe(0);
  });
});
