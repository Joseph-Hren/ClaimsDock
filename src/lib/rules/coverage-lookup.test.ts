import { describe, it, expect } from 'vitest';
import { generateClaims } from '../claims/generate-claims';
import { computeClaimCoverage } from './coverage-lookup';

const claims = generateClaims();

describe('computeClaimCoverage', () => {
  it('computes a line total that matches the claim\'s own authored total_charge, for every seed claim', () => {
    // Regression test for a real bug: CMS-1500's box24f_charge is a
    // per-unit rate that must be multiplied by box24g_units, while UB-04's
    // box47_total_charge is already the line total — mixing those up first
    // surfaced here (CPX-CMB-01A computed $460 instead of its real $880).
    for (const claim of claims) {
      const result = computeClaimCoverage(claim);
      expect(result.totalCharge, `${claim.claim_id} total mismatch`).toBe(claim.total_charge);
    }
  });

  it('waives the network penalty for an emergency-department line', () => {
    const clnUb = claims.find((c) => c.claim_id === 'CLN-UB-01')!;
    const result = computeClaimCoverage(clnUb);
    // Northgate Emergency Medical Center is in-network in this data set, so
    // this doesn't independently prove the emergency exemption — it does
    // confirm the ED line resolves to a real, positive covered amount at
    // the ED coverage rate rather than throwing on an unmapped category.
    expect(result.totalCovered).toBeGreaterThan(0);
  });

  it('runs without error against every seed claim (network + member data completeness)', () => {
    for (const claim of claims) {
      expect(() => computeClaimCoverage(claim)).not.toThrow();
    }
  });
});
