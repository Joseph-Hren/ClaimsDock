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
