// Claim lifecycle status — project-spec.txt Section 7a. Seven values, each
// earning its place by carrying real, non-redundant information (the same
// test that rejected a sixth "Overdue" status back in Section 5a): status is
// lifecycle position, a separate axis from severity, confidence, and category.
//
// Only the two initial values are derivable in code today —
// deriveInitialStatus() runs immediately after Call 1, using category alone,
// no confidence needed. The other five (Needs Approval, Additional Info
// Requested, Denied, Escalated, Resolved) are lifecycle transitions driven by
// the Router/Human Gate, which don't exist yet (Phases 6/7) — but the type
// is complete now so those phases fill in an already-correct shape rather
// than rediscovering it.
//
// Transition map (for reference — not encoded as a state machine yet):
//   Submitted, no flags   -- clean / complex-math / non-material missing-data
//   Submitted, flagged    -- fraud / ambiguous / material missing-data
//   Needs Approval        <- Submitted, no flags (confidence Suspected/Uncertain on clean;
//                             or unconditionally for complex-math, which never gets a tier)
//   Additional Info Req.  <- Submitted, flagged (human confirms material info is genuinely
//                             needed — terminal in this system; there's no real intake
//                             path for the info to ever actually arrive)
//   Denied                <- Submitted, flagged, or Needs Approval (human clicks Deny)
//   Escalated             <- Submitted, flagged, or Needs Approval (human sends it upward,
//                             or ambiguous's always-escalate rule)
//   Resolved              <- Submitted, no flags (auto-approval), or any status
//                             (human approves, as recommended / with edit / overriding
//                             a hold, denial, or escalation recommendation)

import type { Category } from './action-lookup';

export type ClaimStatus =
  | 'Submitted, no flags'
  | 'Submitted, flagged'
  | 'Needs Approval'
  | 'Additional Info Requested'
  | 'Denied'
  | 'Escalated'
  | 'Resolved';

export type InitialStatus = Extract<ClaimStatus, 'Submitted, no flags' | 'Submitted, flagged'>;

export function deriveInitialStatus(params: {
  category: Category;
  /** Required only when category is 'missing-data' — see project-spec.txt Section 7c. */
  missingFieldIsMaterial?: boolean;
}): InitialStatus {
  if (params.category === 'fraud' || params.category === 'ambiguous') {
    return 'Submitted, flagged';
  }
  if (params.category === 'missing-data') {
    if (params.missingFieldIsMaterial === undefined) {
      throw new Error('deriveInitialStatus: missingFieldIsMaterial is required for the missing-data category');
    }
    return params.missingFieldIsMaterial ? 'Submitted, flagged' : 'Submitted, no flags';
  }
  // clean, complex-math: neither can ever be flagged — Approve is always reachable.
  return 'Submitted, no flags';
}
