// SLA/deadline math — project-spec.txt Section 5a. A pure function: given a
// tier, a submission time, and (optionally) when a missing-info hold began,
// returns how much of the deadline window is actually left. Recalculated
// live wherever it's called — nothing here is ever cached or stored.

import type { SlaTier } from '../claims/types';

export const SLA_WINDOW_HOURS: Record<SlaTier, number> = {
  standard: 30 * 24,
  urgent: 72,
};

export interface SlaStatus {
  windowHours: number;
  activeElapsedHours: number;
  percentRemaining: number; // can go negative once the deadline is breached
  isBreached: boolean;
}

export function computeSlaStatus(params: {
  slaTier: SlaTier;
  submittedDate: string | Date;
  now?: Date;
  /** If set, the clock stops accruing at this timestamp (a missing-info hold) — see temporary-hold.ts for how this gets derived until Phase 7. */
  heldSince?: Date | null;
}): SlaStatus {
  const now = params.now ?? new Date();
  const submitted = new Date(params.submittedDate);
  const clockStopPoint = params.heldSince ?? now;
  const activeElapsedHours = Math.max(0, (clockStopPoint.getTime() - submitted.getTime()) / 3_600_000);
  const windowHours = SLA_WINDOW_HOURS[params.slaTier];
  const percentRemaining = 1 - activeElapsedHours / windowHours;
  return {
    windowHours,
    activeElapsedHours,
    percentRemaining,
    isBreached: percentRemaining <= 0,
  };
}
