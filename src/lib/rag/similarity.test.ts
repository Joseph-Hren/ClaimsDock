import { describe, it, expect } from 'vitest';
import { cosineSimilarity, topK } from './similarity';

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });

  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it('is -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1, 5);
  });

  it('is unaffected by vector magnitude, only direction', () => {
    const a = cosineSimilarity([1, 2, 3], [2, 4, 6]);
    expect(a).toBeCloseTo(1, 5);
  });

  it('throws on mismatched vector lengths', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });

  it('returns 0 rather than NaN for a zero vector', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('topK', () => {
  it('returns the k highest-scoring items in descending order', () => {
    const items = ['a', 'b', 'c', 'd'];
    const scores = [0.1, 0.9, 0.5, 0.3];
    const result = topK(items, scores, 2);
    expect(result.map((r) => r.item)).toEqual(['b', 'c']);
    expect(result[0].score).toBeCloseTo(0.9, 5);
  });

  it('returns fewer than k if there are fewer items than k', () => {
    const result = topK(['x'], [0.5], 5);
    expect(result.length).toBe(1);
  });
});
