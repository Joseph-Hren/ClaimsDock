import { describe, it, expect } from 'vitest';
import { lookupAction } from './action-lookup';

describe('lookupAction', () => {
  it('denies fraud only at High Confidence', () => {
    expect(lookupAction({ category: 'fraud', confidence: 'High Confidence' })).toBe('Deny');
  });

  it('escalates fraud at every other confidence tier, never denies or approves', () => {
    expect(lookupAction({ category: 'fraud', confidence: 'Confident' })).toBe('Escalate');
    expect(lookupAction({ category: 'fraud', confidence: 'Suspected' })).toBe('Escalate');
    expect(lookupAction({ category: 'fraud', confidence: 'Uncertain' })).toBe('Escalate');
  });

  it('throws if fraud is looked up without a confidence tier', () => {
    expect(() => lookupAction({ category: 'fraud' })).toThrow();
  });

  it('always escalates ambiguous claims regardless of confidence', () => {
    expect(lookupAction({ category: 'ambiguous' })).toBe('Escalate');
  });

  it('requests info for a material missing-data gap, approves a non-material one', () => {
    expect(lookupAction({ category: 'missing-data', missingFieldIsMaterial: true })).toBe('Request Additional Info');
    expect(lookupAction({ category: 'missing-data', missingFieldIsMaterial: false })).toBe('Approve');
  });

  it('always approves-as-calculated for complex-math, no confidence needed', () => {
    expect(lookupAction({ category: 'complex-math' })).toBe('Approve as calculated');
  });

  it('always approves clean claims', () => {
    expect(lookupAction({ category: 'clean' })).toBe('Approve');
  });
});
