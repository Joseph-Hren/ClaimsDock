// Analysis tool dispatch — project-spec.txt Section 1's table: "does this
// look off." Default behavior re-surfaces the already-computed Pipeline
// evidence for this claim (free, instant, code-only). recheck: true reruns
// Call 1 + Call 2 fresh for just this claim (reanalyze.ts).

import type { ClaimIndex } from './types';
import type { ProviderHistoryEntry } from '../claims/types';
import { recheckClaim } from './reanalyze';
import { isRecommendationFulfilled } from '../rules/status';

export interface AnalyzeClaimResult {
  claim_id: string;
  category: string;
  category_detail: string;
  evidence: string[];
  confidence: string;
  rechecked: boolean;
  /** Added 2026-08-06 — this result previously carried no status/severity/
   *  recommendation fields at all, unlike recommend_action and lookup_claim
   *  (both fixed the same day). Found live: "tell me about this claim" on
   *  an already-DENIED fraud claim routed through analyze_claim and came
   *  back with a full evidence walkthrough but zero mention that the claim
   *  had already been denied — not a prompt-following gap like the other
   *  two fixes, a genuinely missing field this tool never had to check. */
  status: string;
  severity: string;
  recommended_action: string;
  recommendation_fulfilled: boolean;
}

export type AnalyzeDispatchResult = { mode: 'ok'; data: AnalyzeClaimResult } | { mode: 'error'; message: string };

export async function dispatchAnalyzeClaim(
  index: ClaimIndex,
  providerHistory: ProviderHistoryEntry[],
  input: { claim_id: string; recheck?: boolean },
  now: Date,
): Promise<AnalyzeDispatchResult> {
  const entry = index.get(input.claim_id);
  if (!entry) {
    return { mode: 'error', message: `No claim found with ID "${input.claim_id}".` };
  }

  if (input.recheck) {
    const fresh = await recheckClaim(entry.claim, providerHistory, now);
    return {
      mode: 'ok',
      data: {
        // input.claim_id is the display number already confirmed valid above
        // — fresh.claim_id is the real internal id (PipelineClaimResult
        // always carries that) and must never be echoed back (Section 7d).
        claim_id: input.claim_id,
        category: fresh.category,
        category_detail: fresh.category_detail,
        evidence: fresh.evidence,
        confidence: fresh.confidence_tier ?? 'N/A (complex-math)',
        rechecked: true,
        status: fresh.status,
        severity: fresh.severity,
        recommended_action: fresh.recommended_action,
        recommendation_fulfilled: isRecommendationFulfilled(fresh.recommended_action, fresh.status),
      },
    };
  }

  const { result } = entry;
  return {
    mode: 'ok',
    data: {
      claim_id: input.claim_id,
      category: result.category,
      category_detail: result.category_detail,
      evidence: result.evidence,
      confidence: result.confidence_tier ?? 'N/A (complex-math)',
      rechecked: false,
      status: result.status,
      severity: result.severity,
      recommended_action: result.recommended_action,
      recommendation_fulfilled: isRecommendationFulfilled(result.recommended_action, result.status),
    },
  };
}
