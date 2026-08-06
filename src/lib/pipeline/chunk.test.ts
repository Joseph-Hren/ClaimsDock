import { describe, it, expect } from 'vitest';
import { distributeEvenlyByCategory, distributeClaimsForAnalysis } from './chunk';
import type { GeneratedClaim } from '../claims/types';

function fixtureClaim(id: string, scenario: 'clean' | 'fraud' | 'complex-math', linkedId: string | null = null): GeneratedClaim {
  return {
    claim_id: id,
    linked_claim_id: linkedId,
    _testMeta: { scenario, scenario_label: scenario, note: '' },
  } as unknown as GeneratedClaim;
}

describe('distributeEvenlyByCategory', () => {
  it('splits multiple distinct categories evenly across chunks, independently of each other', () => {
    const clean = Array.from({ length: 12 }, (_, i) => ({ id: `clean-${i}`, category: 'clean' }));
    const fraud = Array.from({ length: 6 }, (_, i) => ({ id: `fraud-${i}`, category: 'fraud' }));
    const chunks = distributeEvenlyByCategory([...fraud, ...clean], 3, (item) => item.category);

    expect(chunks).toHaveLength(3);
    chunks.forEach((chunk) => {
      expect(chunk.filter((i) => i.category === 'clean')).toHaveLength(4);
      expect(chunk.filter((i) => i.category === 'fraud')).toHaveLength(2);
    });
  });

  it('does not let one expensive category cluster into the same chunks as another (the real bug found live)', () => {
    // Mirrors the real regression: fraud and complex-math both non-clean,
    // but distinct categories — a binary clean/non-clean split let both
    // cluster into the same chunks under simple round-robin. Distributing
    // each category independently must spread each across every chunk.
    const fraud = Array.from({ length: 6 }, (_, i) => ({ id: `fraud-${i}`, category: 'fraud' }));
    const complexMath = Array.from({ length: 6 }, (_, i) => ({ id: `cpx-${i}`, category: 'complex-math' }));
    const chunks = distributeEvenlyByCategory([...fraud, ...complexMath], 6, (item) => item.category);

    chunks.forEach((chunk) => {
      expect(chunk.filter((i) => i.category === 'fraud')).toHaveLength(1);
      expect(chunk.filter((i) => i.category === 'complex-math')).toHaveLength(1);
    });
  });

  it('preserves every item exactly once', () => {
    const items = Array.from({ length: 17 }, (_, i) => ({ id: i, category: i % 3 === 0 ? 'clean' : 'fraud' }));
    const chunks = distributeEvenlyByCategory(items, 4, (i) => i.category);
    expect(chunks.flat().map((i) => i.id).sort((a, b) => a - b)).toEqual(items.map((i) => i.id));
  });

  it('rejects a non-positive chunk count', () => {
    expect(() => distributeEvenlyByCategory([1], 0, () => 'x')).toThrow();
  });

  it('keeps per-chunk SIZE variance to at most 1, even with five categories whose counts are not individually divisible by the chunk count (the real regression)', () => {
    // A per-category-independent round-robin (the second, still-broken
    // version of this function) let each category's own remainder land on
    // the same low-index chunks, compounding across categories rather than
    // canceling out — confirmed live to make Call 1's real spread WORSE
    // (3,023-8,322 completion tokens) than the original unshuffled file
    // order. Counts below deliberately mirror that shape: five groups, none
    // evenly divisible by 6.
    const categoryCounts: Record<string, number> = { clean: 63, fraud: 15, 'complex-math': 13, ambiguous: 19, 'missing-data': 7 };
    const items = Object.entries(categoryCounts).flatMap(([category, count]) =>
      Array.from({ length: count }, (_, i) => ({ id: `${category}-${i}`, category })),
    );

    const chunks = distributeEvenlyByCategory(items, 6, (item) => item.category);
    const sizes = chunks.map((c) => c.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });
});

describe('distributeClaimsForAnalysis', () => {
  it('keeps a linked pair together in the same chunk even when categories differ from neighbors', () => {
    const claims: GeneratedClaim[] = [
      fixtureClaim('FRD-A', 'fraud', 'FRD-B'),
      fixtureClaim('FRD-B', 'fraud', 'FRD-A'),
      ...Array.from({ length: 10 }, (_, i) => fixtureClaim(`CLN-${i}`, 'clean')),
    ];

    const chunks = distributeClaimsForAnalysis(claims, 4);
    const chunkOfA = chunks.findIndex((c) => c.some((claim) => claim.claim_id === 'FRD-A'));
    const chunkOfB = chunks.findIndex((c) => c.some((claim) => claim.claim_id === 'FRD-B'));

    expect(chunkOfA).toBe(chunkOfB);
    expect(chunkOfA).not.toBe(-1);
  });

  it('preserves every claim exactly once, including both halves of every pair', () => {
    const claims: GeneratedClaim[] = [
      fixtureClaim('FRD-A', 'fraud', 'FRD-B'),
      fixtureClaim('FRD-B', 'fraud', 'FRD-A'),
      fixtureClaim('CLN-A', 'clean', 'CLN-B'),
      fixtureClaim('CLN-B', 'clean', 'CLN-A'),
      fixtureClaim('CLN-STANDALONE', 'clean'),
    ];

    const chunks = distributeClaimsForAnalysis(claims, 2);
    const allIds = chunks.flat().map((c) => c.claim_id).sort();
    expect(allIds).toEqual(['CLN-A', 'CLN-B', 'CLN-STANDALONE', 'FRD-A', 'FRD-B'].sort());
  });

  it('distributes every category evenly, not clustered by file order', () => {
    // Mirrors the real seed data's shape: fraud and complex-math claims
    // both cluster before a long run of clean claims — the exact ordering
    // that produced real per-chunk token variance before this fix, and that
    // a binary clean/non-clean split failed to fully correct.
    const claims: GeneratedClaim[] = [
      ...Array.from({ length: 6 }, (_, i) => fixtureClaim(`FRD-${i}`, 'fraud')),
      ...Array.from({ length: 6 }, (_, i) => fixtureClaim(`CPX-${i}`, 'complex-math')),
      ...Array.from({ length: 18 }, (_, i) => fixtureClaim(`CLN-${i}`, 'clean')),
    ];

    const chunks = distributeClaimsForAnalysis(claims, 6);
    chunks.forEach((chunk) => {
      expect(chunk.some((c) => c._testMeta.scenario === 'fraud')).toBe(true);
      expect(chunk.some((c) => c._testMeta.scenario === 'complex-math')).toBe(true);
      expect(chunk.some((c) => c._testMeta.scenario === 'clean')).toBe(true);
    });
  });
});
