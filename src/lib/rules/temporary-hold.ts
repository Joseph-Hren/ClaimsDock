// TEMPORARY — stands in for real hold-tracking until Phase 7 (Human Gate &
// Persistence) exists. Real hold state needs an actual event ("an adjuster
// requested more info at time X"), which nothing in the system produces yet.
//
// Stand-in used for now: a missing-data-scenario claim whose flagged field
// is still null is treated as held from the moment it was submitted — zero
// active elapsed time, not a stale "however long ago it was submitted"
// number. When Phase 7 lands, replace calls to this function with the real
// held-since timestamp and delete this file — computeSlaStatus itself
// already takes heldSince as a plain parameter and doesn't know this stub
// exists.

import type { Claim } from '../claims/types';

export function temporaryHeldSince(claim: Claim, submittedDate: Date): Date | null {
  if (claim._testMeta.scenario === 'missing-data' && claim._testMeta.deliberately_missing_field) {
    return submittedDate;
  }
  return null;
}
