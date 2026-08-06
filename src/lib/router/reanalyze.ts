// The "recheck" escape hatch — reruns Call 1 + Call 2 for a single claim on
// demand, reusing Phase 5's own functions and merge logic exactly (nothing
// duplicated). Reserved for an explicit "re-check this claim" request; the
// default Analysis/Recommendation path just re-surfaces the already-computed
// result (see lookup.ts's ClaimIndex) rather than paying for a new call.

import type { GeneratedClaim, ProviderHistoryEntry } from '../claims/types';
import { buildClaimNumberRegistry } from '../claims/claim-number';
import { runAnalysis } from '../pipeline/analysis';
import { runConfidence } from '../pipeline/confidence';
import { reconcileCategory, buildClaimResult, type PipelineClaimResult } from '../pipeline/orchestrator';
import type { ModelProvider } from '../pipeline/model-client';

export async function recheckClaim(
  claim: GeneratedClaim,
  providerHistory: ProviderHistoryEntry[],
  now: Date,
  // Defaults to match the real Pipeline's own routing decision (cache.ts) —
  // a recheck triggered from Anchor should use the same provider as the
  // cached result it's rechecking, not silently fall back to Claude.
  provider: ModelProvider = 'kimi',
): Promise<PipelineClaimResult> {
  // Must include linked_claim_id too, even though its full record isn't
  // fetched here (a pre-existing limitation of a single-claim recheck,
  // unrelated to this registry) — format-claim.ts's redaction unconditionally
  // translates whatever linked_claim_id string is present on the claim, and
  // the registry throws on an id it was never built with.
  const registryIds = claim.linked_claim_id ? [claim.claim_id, claim.linked_claim_id] : [claim.claim_id];
  const registry = buildClaimNumberRegistry(registryIds);

  const [analysisResult] = await runAnalysis([claim], providerHistory, registry, provider);
  const reconciled = reconcileCategory(claim, analysisResult);
  const [confidenceResult] = await runConfidence(
    [
      {
        claim_id: reconciled.claim_id,
        category: reconciled.proposed_category,
        category_detail: reconciled.category_detail,
        evidence: reconciled.evidence,
      },
    ],
    registry,
    provider,
  );
  return buildClaimResult(claim, reconciled, confidenceResult, now);
}
