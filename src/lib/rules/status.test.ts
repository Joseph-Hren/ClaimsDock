import { describe, it, expect } from 'vitest';
import { deriveInitialStatus } from './status';

describe('deriveInitialStatus', () => {
  it('flags fraud and ambiguous immediately, by category alone', () => {
    expect(deriveInitialStatus({ category: 'fraud' })).toBe('Submitted, flagged');
    expect(deriveInitialStatus({ category: 'ambiguous' })).toBe('Submitted, flagged');
  });

  it('does not flag clean or complex-math — Approve is always reachable for these', () => {
    expect(deriveInitialStatus({ category: 'clean' })).toBe('Submitted, no flags');
    expect(deriveInitialStatus({ category: 'complex-math' })).toBe('Submitted, no flags');
  });

  it('flags missing-data only when the gap is material', () => {
    expect(deriveInitialStatus({ category: 'missing-data', missingFieldIsMaterial: true })).toBe('Submitted, flagged');
    expect(deriveInitialStatus({ category: 'missing-data', missingFieldIsMaterial: false })).toBe('Submitted, no flags');
  });

  it('throws if missing-data is looked up without stating materiality', () => {
    expect(() => deriveInitialStatus({ category: 'missing-data' })).toThrow();
  });
});
