// Shared types for the Interactive Router (project-spec.txt Section 1). The
// Router is on-demand, triggered only by an adjuster's question — unlike the
// Evaluation Pipeline, which runs automatically the moment a claim arrives.

import type { GeneratedClaim } from '../claims/types';
import type { PipelineClaimResult } from '../pipeline/orchestrator';
import type { ClaimNumberRegistry } from '../claims/claim-number';
import type { Category } from '../rules/action-lookup';
import type { ClaimStatus } from '../rules/status';
import type { SeverityBand } from '../rules/severity';

export interface ClaimIndexEntry {
  claim: GeneratedClaim;
  result: PipelineClaimResult;
}

/**
 * The already-computed Pipeline output for every claim, keyed by the opaque
 * display claim number — NOT the real internal claim_id. Claude has to be
 * able to specify a claim_id itself when calling lookup_claim (parsed from
 * the adjuster's own question, or the "claim in view" context note), and
 * every dispatch result below gets echoed straight back into the
 * conversation — so the real claim_id, which encodes the authored scenario
 * in its own text (project-spec.txt Section 7d), can never be the key or
 * appear in a result here, for the same reason it can't reach the Pipeline.
 * In production this would be read from the per-ISO-week cache (Section 1,
 * 11) served by app/api/ — that caching/serving layer doesn't exist yet, so
 * for Phase 6 the index is just built once (by whatever calls the Router:
 * the smoke test today, a real API route later) from a single runPipeline()
 * call and handed in. The Router itself has no opinion on where it came from.
 */
export type ClaimIndex = Map<string, ClaimIndexEntry>;

export function buildClaimIndex(
  claims: GeneratedClaim[],
  results: PipelineClaimResult[],
  registry: ClaimNumberRegistry,
): ClaimIndex {
  const resultsById = new Map(results.map((r) => [r.claim_id, r]));
  const index: ClaimIndex = new Map();
  for (const claim of claims) {
    const result = resultsById.get(claim.claim_id);
    if (!result) {
      throw new Error(`buildClaimIndex: no Pipeline result for claim_id "${claim.claim_id}"`);
    }
    index.set(registry.toDisplay(claim.claim_id), { claim, result });
  }
  return index;
}

export interface LookupFilter {
  /** A single status, or a set (e.g. the "still active" default for "what should I work on"). */
  status?: ClaimStatus | ClaimStatus[];
  severity?: SeverityBand;
  category?: Category;
  /** Case-insensitive substring match against the patient's name — a typo or a first/last-name-only query should still find the right claim. */
  patient_name?: string;
  /** Case-insensitive substring match against the billing provider's name. */
  provider_name?: string;
  /** Inclusive lower bound on total_charge. */
  min_amount?: number;
  /** Inclusive upper bound on total_charge. */
  max_amount?: number;
  /** Inclusive upper bound on SLA percent remaining, expressed 0-100 (e.g. 10 for "less than 10% of the SLA window left"). Internally compared against the 0-1 fraction computeSlaStatus produces. */
  max_sla_percent_remaining?: number;
  /** Exact match against the claim's recommended_action (e.g. "Deny", "Escalate"). */
  recommended_action?: string;
}

export type ToolName = 'lookup_claim' | 'analyze_claim' | 'recommend_action' | 'reference_lookup';
