import { describe, it, expect } from 'vitest';
import { claimDisplayNumber, buildClaimNumberRegistry } from './claim-number';

describe('claimDisplayNumber', () => {
  it('is deterministic for the same input', () => {
    expect(claimDisplayNumber('FRD-UPCODE-01')).toBe(claimDisplayNumber('FRD-UPCODE-01'));
  });

  it('produces a CLM-nnnn-nnnnnn string whose digits never start with 0', () => {
    expect(claimDisplayNumber('CLN-CMS-01')).toMatch(/^CLM-[1-9]\d{3}-\d{6}$/);
  });

  it('differs for different inputs', () => {
    expect(claimDisplayNumber('CLN-CMS-01')).not.toBe(claimDisplayNumber('CLN-CMS-02'));
  });

  it('never reveals its input scenario text', () => {
    const number = claimDisplayNumber('FRD-UPCODE-01');
    expect(number).not.toContain('UPCODE');
    expect(number).toMatch(/^CLM-\d{4}-\d{6}$/);
  });
});

describe('buildClaimNumberRegistry', () => {
  it('round-trips every claim id through toDisplay/toClaimId', () => {
    const ids = ['CLN-CMS-01', 'FRD-UPCODE-01', 'AMB-CMB-01A', 'AMB-CMB-01B'];
    const registry = buildClaimNumberRegistry(ids);
    for (const id of ids) {
      expect(registry.toClaimId(registry.toDisplay(id))).toBe(id);
    }
  });

  it('assigns a distinct number to every claim id, even at 120-claim scale', () => {
    const ids = Array.from({ length: 120 }, (_, i) => `CLM-TEST-${i}`);
    const registry = buildClaimNumberRegistry(ids);
    const numbers = ids.map((id) => registry.toDisplay(id));
    expect(new Set(numbers).size).toBe(ids.length);
  });

  it('throws for a claim id it was never built with', () => {
    const registry = buildClaimNumberRegistry(['A']);
    expect(() => registry.toDisplay('B')).toThrow();
  });

  it('returns undefined for a display number that was never assigned', () => {
    const registry = buildClaimNumberRegistry(['A']);
    expect(registry.toClaimId('CLM-0000-000000')).toBeUndefined();
  });
});
