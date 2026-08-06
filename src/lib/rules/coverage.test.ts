import { describe, it, expect } from 'vitest';
import { computeCoverage, computeInpatientDayCapSplit } from './coverage';

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

describe('computeInpatientDayCapSplit', () => {
  it("matches CPX-CMB-01B's own worked example — a 5-day stay crossing a 60-day annual cap on day 3", () => {
    // 57 days already used this plan year, 60-day cap, 5-day stay at $1,950/day
    // (Gerald Nakamura's real shape: $9,750 total / 5 units).
    const result = computeInpatientDayCapSplit({
      totalDaysThisStay: 5,
      chargePerDay: 1950,
      daysUsedBeforeThisStay: 57,
      annualDayCap: 60,
      normalCoverageRate: 0.8,
      postCapCoverageRate: 0.5,
    });
    expect(result.daysBeforeCap).toBe(3);
    expect(result.daysAfterCap).toBe(2);
    // 3 days @ 1950 * 0.8 = 4680, 2 days @ 1950 * 0.5 = 1950 -> 6630 covered
    expect(result.coveredAmount).toBeCloseTo(6630, 2);
    expect(result.patientResponsibility).toBeCloseTo(3120, 2);
  });

  it('applies the normal rate to every day when the stay never reaches the cap', () => {
    const result = computeInpatientDayCapSplit({
      totalDaysThisStay: 3,
      chargePerDay: 1000,
      daysUsedBeforeThisStay: 0,
      annualDayCap: 60,
      normalCoverageRate: 0.8,
      postCapCoverageRate: 0.5,
    });
    expect(result.daysBeforeCap).toBe(3);
    expect(result.daysAfterCap).toBe(0);
    expect(result.coveredAmount).toBeCloseTo(2400, 2);
  });

  it('applies the post-cap rate to every day when the cap was already fully used before this stay', () => {
    const result = computeInpatientDayCapSplit({
      totalDaysThisStay: 4,
      chargePerDay: 1000,
      daysUsedBeforeThisStay: 60,
      annualDayCap: 60,
      normalCoverageRate: 0.8,
      postCapCoverageRate: 0.5,
    });
    expect(result.daysBeforeCap).toBe(0);
    expect(result.daysAfterCap).toBe(4);
    expect(result.coveredAmount).toBeCloseTo(2000, 2);
  });
});
