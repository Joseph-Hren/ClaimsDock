// Severity calculation — project-spec.txt Section 7b. A pure function of
// dollar amount, disputed medical necessity, and SLA-window percentage
// remaining. Never a judgment call, never asked of the model, never cached —
// recalculated live every time it's needed (see sla.ts for the same rule).

import type { ClaimStatus } from './status';

export type SeverityBand = 'Low' | 'Moderate' | 'High' | 'Critical';

const BAND_ORDER: SeverityBand[] = ['Low', 'Moderate', 'High', 'Critical'];

function bandIndex(band: SeverityBand): number {
  return BAND_ORDER.indexOf(band);
}

function maxBand(a: SeverityBand, b: SeverityBand): SeverityBand {
  return bandIndex(a) >= bandIndex(b) ? a : b;
}

function oneTierUp(band: SeverityBand): SeverityBand {
  return BAND_ORDER[Math.min(BAND_ORDER.length - 1, bandIndex(band) + 1)];
}

/** Factor 1 — dollar-amount base band (Section 7b). */
export function baseSeverityBand(billedAmount: number): SeverityBand {
  if (billedAmount > 25_000) return 'Critical';
  if (billedAmount >= 5_000) return 'High';
  if (billedAmount >= 500) return 'Moderate';
  return 'Low';
}

export function computeSeverity(params: {
  billedAmount: number;
  disputedMedicalNecessity: boolean;
  slaPercentRemaining: number; // from sla.ts's computeSlaStatus().percentRemaining
}): SeverityBand {
  let band = baseSeverityBand(params.billedAmount);

  // Disputed medical necessity bumps to at least High, regardless of dollar amount.
  if (params.disputedMedicalNecessity) {
    band = maxBand(band, 'High');
  }

  const pct = params.slaPercentRemaining;

  // Deadline breached overrides every other factor.
  if (pct <= 0) return 'Critical';

  if (pct < 0.25) {
    // Escalate to at least High, or to Critical if already High.
    band = band === 'High' ? 'Critical' : maxBand(band, 'High');
  } else if (pct < 0.5) {
    // Escalate exactly one tier.
    band = oneTierUp(band);
  }
  // >= 50% remaining: no change.

  return band;
}

/**
 * The display severity for a claim's *current* status — project-spec.txt
 * Section 7b, added 2026-07-28. Once a claim reaches a real decision
 * (Resolved or Denied), severity is always Low: there's no time-dependence
 * to it at all, since this system doesn't simulate reimbursement/payment
 * timing (Explicit Non-Goals) and continuing to escalate severity against a
 * deadline nothing here tracks completion of would be fabricating a number.
 * Every other status (including Additional Info Requested, Escalated, and
 * anything still pending) computes normally — Additional Info Requested
 * comes out frozen on its own, since computeSeverity's slaPercentRemaining
 * input already reflects the missing-info hold's stopped clock (sla.ts,
 * temporary-hold.ts) rather than needing a separate freeze here.
 *
 * Recoupment Requested (added 2026-07-30) is a fixed override too, for the
 * same reason — no real timeline to compute against — but fixed to High
 * rather than Low. Severity does double duty here as both computed urgency
 * and "don't let this disappear in a worklist"; a plain Resolved claim is
 * genuinely done, but one now under recoupment is exactly the kind of
 * exception a severity-sorted or severity-filtered view exists to surface.
 */
export function resolveSeverity(params: {
  status: ClaimStatus;
  billedAmount: number;
  disputedMedicalNecessity: boolean;
  slaPercentRemaining: number;
}): SeverityBand {
  if (params.status === 'Resolved' || params.status === 'Denied') {
    return 'Low';
  }
  if (params.status === 'Recoupment Requested') {
    return 'High';
  }
  return computeSeverity({
    billedAmount: params.billedAmount,
    disputedMedicalNecessity: params.disputedMedicalNecessity,
    slaPercentRemaining: params.slaPercentRemaining,
  });
}
