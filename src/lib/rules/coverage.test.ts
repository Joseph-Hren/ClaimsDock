import { describe, it, expect } from 'vitest';
import { computeCoverage } from './coverage';

describe('computeCoverage', () => {
  it('matches the spec\'s own worked example exactly (Section 6)', () => {
    // Billed $1,140 -> plan covers 80% after deductible (met) -> $912 calculated coverage.
    const result = computeCoverage({
      lines: [{ charge: 1140, categoryKey: 'outpatient_procedure' }],
      deductibleRemaining: 0,
      isInNetwork: true,
    });
    expect(result.totalCovered).toBeCloseTo(912, 2);
    expect(result.totalPatientResponsibility).toBeCloseTo(228, 2);
  });

  it('applies the full charge to an unmet deductible before any coverage kicks in', () => {
    const result = computeCoverage({
      lines: [{ charge: 300, categoryKey: 'primary_specialist_visit' }],
      deductibleRemaining: 500,
      isInNetwork: true,
    });
    expect(result.lineResults[0].deductibleApplied).toBe(300);
    expect(result.lineResults[0].coveredAmount).toBe(0);
    expect(result.deductibleRemainingAfter).toBe(200);
  });

  it('crosses the deductible threshold mid-claim across multiple lines — the actual complex-math case', () => {
    // $150 remaining deductible, three lines: 210, 25, 110 (CPX-CMS-01's real shape)
    const result = computeCoverage({
      lines: [
        { charge: 210, categoryKey: 'primary_specialist_visit' }, // 90% category
        { charge: 25, categoryKey: 'primary_specialist_visit' },
        { charge: 110, categoryKey: 'primary_specialist_visit' },
      ],
      deductibleRemaining: 150,
      isInNetwork: true,
    });
    // Line 1: 150 toward deductible, 60 left at 90% = 54 covered, 6 patient
    expect(result.lineResults[0].deductibleApplied).toBe(150);
    expect(result.lineResults[0].coveredAmount).toBeCloseTo(54, 2);
    // Deductible now exhausted — remaining lines fully subject to coverage rate
    expect(result.lineResults[1].deductibleApplied).toBe(0);
    expect(result.lineResults[1].coveredAmount).toBeCloseTo(22.5, 2);
    expect(result.lineResults[2].coveredAmount).toBeCloseTo(99, 2);
    expect(result.deductibleRemainingAfter).toBe(0);
  });

  it('applies a flat out-of-network rate rather than a discount off the category rate', () => {
    const result = computeCoverage({
      lines: [{ charge: 1000, categoryKey: 'inpatient_facility' }], // 80% in-network category
      deductibleRemaining: 0,
      isInNetwork: false,
    });
    expect(result.totalCovered).toBeCloseTo(600, 2); // flat 60%, not 80% discounted
  });

  it('exempts emergency claims from the out-of-network penalty', () => {
    const result = computeCoverage({
      lines: [{ charge: 1000, categoryKey: 'emergency_department' }],
      deductibleRemaining: 0,
      isInNetwork: false,
      isEmergency: true,
    });
    expect(result.totalCovered).toBeCloseTo(800, 2); // in-network ER rate applies anyway
  });
});
