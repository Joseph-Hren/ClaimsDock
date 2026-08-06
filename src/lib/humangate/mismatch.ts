// The recommendation-mismatch guardrail — project-spec.txt Section 4a(a).
// Deterministic, no model call, no server-only dependency — split out of
// guardrails.ts (2026-08-04) specifically so a client component (the Deny/
// Approve/Escalate/Request-Info overlay) can import it directly without
// dragging guardrails.ts's checkDenialJustificationQuality — and, via
// rag/retrieve.ts, Node's `fs` module — into the browser bundle. Confirmed
// live: Turbopack refused to build with "Module not found: Can't resolve
// 'fs'" the moment ActionConfirmOverlay imported checkRecommendationMismatch
// straight from guardrails.ts, since ESM imports are whole-module, not
// per-export — importing anything from a file pulls in everything that
// file itself imports, used or not.

import type { PipelineClaimResult } from '../pipeline/orchestrator';
import type { HumanActionType } from './types';

export interface MismatchCheckResult {
  mismatched: boolean;
  message?: string;
}

// Which RecommendedAction values a given human action is consistent with.
// approve / approve_with_edit both count as "approving."
const ACTION_FAMILY: Record<HumanActionType, string[]> = {
  approve: ['Approve', 'Approve as calculated'],
  approve_with_edit: ['Approve', 'Approve as calculated'],
  escalate: ['Escalate'],
  deny: ['Deny'],
  request_additional_info: ['Request Additional Info'],
};

/**
 * Recommendation-mismatch check — deterministic, no model call. Compares
 * the human's chosen action against the Pipeline's own recommendation; on a
 * mismatch, cites the evidence and narrative the Pipeline already produced
 * rather than generating anything new.
 */
export function checkRecommendationMismatch(
  pipelineResult: PipelineClaimResult,
  action: HumanActionType,
): MismatchCheckResult {
  const consistentWith = ACTION_FAMILY[action];
  if (consistentWith.includes(pipelineResult.recommended_action)) {
    return { mismatched: false };
  }

  return {
    mismatched: true,
    message: `Are you sure? The system recommended "${pipelineResult.recommended_action}" (${pipelineResult.confidence_tier ?? 'N/A (complex-math)'} confidence) for this claim, based on: ${pipelineResult.evidence.join('; ')}. Reasoning: ${pipelineResult.recommendation_narrative}`,
  };
}
