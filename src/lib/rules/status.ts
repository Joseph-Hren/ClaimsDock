// Claim lifecycle status — project-spec.txt Section 7a. Originally seven
// values, each earning its place by carrying real, non-redundant information
// (the same test that rejected a sixth "Overdue" status back in Section 5a):
// status is lifecycle position, a separate axis from severity, confidence,
// and category. An eighth, "Recoupment Requested," was added afterward
// (2026-07-30) and clears the same bar: Approve is intentionally terminal
// (no reversal — real legal hurdles for recoupment), but a Resolved claim
// can still move forward into recoupment, a genuinely distinct lifecycle
// position from a plain Resolved claim nobody's revisiting.
//
// Three of the original seven are derivable in code, as of Phase 5:
// deriveInitialStatus() runs immediately after Call 1, using category alone.
// derivePostPipelineStatus() runs after Call 2 assigns confidence, and
// resolves the auto-approval rule (Section 4) and the Needs-Approval
// transition — both are automatic, system-side outcomes of the Pipeline
// itself, not a human action, so they belong in this same deterministic
// layer rather than waiting on the Human Gate. The remaining four
// (Additional Info Requested, Denied, Escalated, Resolved-by-human-approval)
// are lifecycle transitions driven by an actual human action through the
// Router/Human Gate, which don't exist yet (Phases 6/7) — but the type is
// complete now so those phases fill in an already-correct shape rather than
// rediscovering it.
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

import type { Category, ConfidenceTier, RecommendedAction } from './action-lookup';

export type ClaimStatus =
  | 'Submitted, no flags'
  | 'Submitted, flagged'
  | 'Needs Approval'
  | 'Additional Info Requested'
  | 'Denied'
  | 'Escalated'
  | 'Resolved'
  | 'Recoupment Requested';

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

/**
 * Status immediately after the Pipeline finishes (Call 1's category plus
 * Call 2's confidence tier) — before any human has acted. Resolves two
 * automatic, system-side outcomes on top of deriveInitialStatus():
 *
 * - Auto-approval (Section 4): "Submitted, no flags" + High Confidence or
 *   Confident becomes Resolved immediately, no human click required.
 * - Needs Approval (Section 7a's transition map): "Submitted, no flags" with
 *   Suspected/Uncertain confidence, or complex-math unconditionally (it never
 *   receives a tier at all — Section 7c — but "Approve as calculated" still
 *   needs a human to confirm the math, per Section 6).
 *
 * A flagged claim (fraud/ambiguous/material-missing-data) never reaches this
 * branch — it stays "Submitted, flagged" until a real human action moves it,
 * which is outside this function's scope (Phases 6/7).
 */
export function derivePostPipelineStatus(params: {
  category: Category;
  /** Null only for complex-math, which never receives a tier — Section 7c. */
  confidence: ConfidenceTier | null;
  missingFieldIsMaterial?: boolean;
}): ClaimStatus {
  const initial = deriveInitialStatus({
    category: params.category,
    missingFieldIsMaterial: params.missingFieldIsMaterial,
  });

  if (initial === 'Submitted, flagged') {
    return initial;
  }

  if (params.category === 'complex-math') {
    return 'Needs Approval';
  }

  if (params.confidence === 'High Confidence' || params.confidence === 'Confident') {
    return 'Resolved';
  }

  return 'Needs Approval';
}

// Which status(es) mean a given recommendation has already been carried
// out — by any means, auto-resolved or a human clicking through manually.
// Shared, deterministic home for this (rather than one copy in the Claims
// Card's own display logic and a second, model-inferred version in Anchor's
// prompt) after both were found live to have the same gap: the Claims Card
// kept showing "Recommendation: Approve as calculated" on an already-
// Resolved claim (2026-08-06, fixed with this exact table), and Anchor —
// even once it correctly had the claim's real current status in hand —
// still framed an already-approved claim's recommendation as an open ask
// ("what to do: Approve as calculated... nothing blocking approval") rather
// than recognizing it as already done. A model given the raw facts doesn't
// reliably draw this inference on its own; a deterministic field it can
// just relay does.
const RECOMMENDATION_FULFILLED_BY: Record<RecommendedAction, ClaimStatus[]> = {
  Approve: ['Resolved', 'Recoupment Requested'],
  'Approve as calculated': ['Resolved', 'Recoupment Requested'],
  Escalate: ['Escalated'],
  Deny: ['Denied'],
  'Request Additional Info': ['Additional Info Requested'],
};

export function isRecommendationFulfilled(recommendedAction: RecommendedAction, status: ClaimStatus): boolean {
  return RECOMMENDATION_FULFILLED_BY[recommendedAction].includes(status);
}

// Escalated, Additional Info Requested, and Recoupment Requested are all
// fulfilled in the sense above (the recommendation was carried out), but
// "No action needed" reads wrong for any of the three — nothing further
// from THIS claim is needed, but it isn't actually closed the way a plain
// approval or denial is; it's parked waiting on something else (a
// higher-level reviewer, more information, the recoupment process itself)
// to happen before it moves again. Joseph's own more real-world phrasing
// for these three specifically (2026-08-06); Approve/Approve as calculated/
// Deny's own fulfilled case keeps the plain "No action needed" label.
const FULFILLED_STATUS_LABEL: Partial<Record<ClaimStatus, string>> = {
  Escalated: 'None: awaiting further review',
  'Additional Info Requested': 'None: on hold pending further info',
  'Recoupment Requested': 'None: recoupment request in progress',
};

/** What the Claims Card's own "Recommendation:" text should actually show —
 *  the live recommendation while it's still outstanding, or a status-aware
 *  fulfilled label once isRecommendationFulfilled is true. */
export function recommendationDisplayLabel(recommendedAction: RecommendedAction, status: ClaimStatus): string {
  if (!isRecommendationFulfilled(recommendedAction, status)) return recommendedAction;
  return FULFILLED_STATUS_LABEL[status] ?? 'No action needed';
}
