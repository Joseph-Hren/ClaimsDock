// Coverage math — project-spec.txt Section 6. A calculation, not a judgment
// call: given the plan's coverage percentage, deductible status, and network
// status, computes the covered amount. Processes line items in order so a
// deductible that gets exhausted partway through a multi-line claim is
// handled correctly — the actual case the complex-math test claims exercise.

import { coverageForCategory } from './coverage-constants';

export interface LineChargeInput {
  charge: number;
  categoryKey: string;
}

export interface LineCoverageResult {
  charge: number;
  deductibleApplied: number;
  coveredAmount: number;
  patientResponsibility: number;
}

export interface CoverageResult {
  lineResults: LineCoverageResult[];
  totalCharge: number;
  totalCovered: number;
  totalPatientResponsibility: number;
  deductibleRemainingAfter: number;
}

export interface DayCapSplitResult {
  daysBeforeCap: number;
  daysAfterCap: number;
  coveredAmount: number;
  patientResponsibility: number;
}

/**
 * The annual inpatient benefit-day cap, worked the same way computeCoverage
 * walks a deductible across line items — a running count instead of a
 * running dollar balance. Days already used this plan year (before this
 * admission) come first; whatever's left of the cap absorbs this stay's
 * early days at the normal rate, the remaining days fall to the reduced
 * post-cap rate (project-spec.txt Section 6, CAPS.inpatientPostCapCoverage).
 * A calculation, not a judgment call — same as computeCoverage.
 */
export function computeInpatientDayCapSplit(params: {
  totalDaysThisStay: number;
  chargePerDay: number;
  daysUsedBeforeThisStay: number;
  annualDayCap: number;
  normalCoverageRate: number;
  postCapCoverageRate: number;
}): DayCapSplitResult {
  const daysRemainingUnderCap = Math.max(0, params.annualDayCap - params.daysUsedBeforeThisStay);
  const daysBeforeCap = Math.min(params.totalDaysThisStay, daysRemainingUnderCap);
  const daysAfterCap = params.totalDaysThisStay - daysBeforeCap;

  const coveredAmount =
    daysBeforeCap * params.chargePerDay * params.normalCoverageRate +
    daysAfterCap * params.chargePerDay * params.postCapCoverageRate;
  const totalCharge = params.totalDaysThisStay * params.chargePerDay;

  return { daysBeforeCap, daysAfterCap, coveredAmount, patientResponsibility: totalCharge - coveredAmount };
}

export function computeCoverage(params: {
  lines: LineChargeInput[];
  deductibleRemaining: number;
  isInNetwork: boolean;
  isEmergency?: boolean;
}): CoverageResult {
  let remaining = params.deductibleRemaining;

  const lineResults: LineCoverageResult[] = params.lines.map((line) => {
    const towardDeductible = Math.min(remaining, line.charge);
    remaining -= towardDeductible;

    const afterDeductible = line.charge - towardDeductible;
    const rate = coverageForCategory(line.categoryKey, params.isInNetwork, params.isEmergency);
    const coveredAmount = afterDeductible * rate;
    const patientResponsibility = towardDeductible + (afterDeductible - coveredAmount);

    return { charge: line.charge, deductibleApplied: towardDeductible, coveredAmount, patientResponsibility };
  });

  return {
    lineResults,
    totalCharge: params.lines.reduce((s, l) => s + l.charge, 0),
    totalCovered: lineResults.reduce((s, l) => s + l.coveredAmount, 0),
    totalPatientResponsibility: lineResults.reduce((s, l) => s + l.patientResponsibility, 0),
    deductibleRemainingAfter: remaining,
  };
}
