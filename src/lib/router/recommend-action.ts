// Recommendation tool dispatch — project-spec.txt Section 1's table: "what
// should I do with this." Never executes (Section 1's Clarification on
// action execution) — the actual state change happens only through the
// Human Gate (Phase 7), never here.
//
// Reworked 2026-08-02 ("Anchor fixes 1"): recheck removed entirely — its
// whole purpose was recomputing a fresh recommendation for one claim, which
// risked disagreeing with the claim's own already-displayed, official
// result (a real, observed failure mode — see the Anchor cache-mismatch bug
// logged in Phase 11 Pass D). This tool's job now is explaining and drafting
// supporting language for the recommendation already on record, never
// computing a new one, so category/category_detail/evidence are added to
// give the model enough to do that. Also widened to accept a small group of
// claims (claim_ids) for bulk drafting, capped at MAX_BULK_CLAIMS so one
// call can't balloon into an unwieldy answer or blow past the tool-use
// round budget.

import type { ClaimIndex } from './types';
import { isRecommendationFulfilled } from '../rules/status';

const MAX_BULK_CLAIMS = 10;

export interface RecommendActionResult {
  claim_id: string;
  category: string;
  category_detail: string;
  evidence: string[];
  recommended_action: string;
  recommendation_narrative: string;
  confidence: string;
  severity: string;
  status: string;
  /** Deterministic, not left for the model to infer from status alone —
   *  found live 2026-08-06 that even once Anchor correctly had a claim's
   *  real current status in hand, it still framed an already-fulfilled
   *  recommendation ("Approve as calculated" on an already-Resolved claim)
   *  as an open ask rather than something already done. */
  recommendation_fulfilled: boolean;
}

export interface RecommendActionBatchResult {
  results: RecommendActionResult[];
  requested_count: number;
  truncated: boolean;
}

export type RecommendDispatchResult =
  | { mode: 'ok'; data: RecommendActionBatchResult }
  | { mode: 'error'; message: string };

export function dispatchRecommendAction(
  index: ClaimIndex,
  input: { claim_id?: string; claim_ids?: string[] },
): RecommendDispatchResult {
  const ids = input.claim_ids && input.claim_ids.length > 0 ? input.claim_ids : input.claim_id ? [input.claim_id] : [];
  if (ids.length === 0) {
    return { mode: 'error', message: 'recommend_action requires either claim_id or claim_ids.' };
  }

  const requested_count = ids.length;
  const truncated = ids.length > MAX_BULK_CLAIMS;
  const idsToUse = truncated ? ids.slice(0, MAX_BULK_CLAIMS) : ids;

  const results: RecommendActionResult[] = [];
  for (const id of idsToUse) {
    const entry = index.get(id);
    if (!entry) {
      return { mode: 'error', message: `No claim found with ID "${id}".` };
    }
    const { result } = entry;
    results.push({
      claim_id: id,
      category: result.category,
      category_detail: result.category_detail,
      evidence: result.evidence,
      recommended_action: result.recommended_action,
      recommendation_narrative: result.recommendation_narrative,
      confidence: result.confidence_tier ?? 'N/A (complex-math)',
      severity: result.severity,
      status: result.status,
      recommendation_fulfilled: isRecommendationFulfilled(result.recommended_action, result.status),
    });
  }

  return { mode: 'ok', data: { results, requested_count, truncated } };
}
