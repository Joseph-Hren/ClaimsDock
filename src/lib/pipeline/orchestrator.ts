// Runs the full Evaluation Pipeline (project-spec.txt Section 1): two
// batched API calls (Analysis, then the Confidence judge + recommendation),
// reconciled against the deterministic missing-field safety net, then merged
// with the deterministic layer (severity, SLA, status, action lookup) built
// in Phase 3. Nothing here is model output except evidence, category,
// confidence, and the recommendation narrative — everything else is a
// calculation, per the layering this project has kept consistent since
// Phase 3.
//
// The per-claim reconciliation and merge steps are exported standalone
// (reconcileCategory, buildClaimResult) so the Router's "recheck" path
// (Phase 6) can reuse the exact same deterministic logic for a single claim
// on demand, instead of duplicating it.

import { generateClaims, getProviderHistory } from '../claims/generate-claims';
import type { GeneratedClaim } from '../claims/types';
import { buildClaimNumberRegistry } from '../claims/claim-number';
import { runAnalysis, type AnalysisResult } from './analysis';
import { runConfidence, type ConfidenceResult } from './confidence';
import { distributeClaimsForAnalysis, distributeEvenlyByCategory } from './chunk';
import { withChunkRetry } from './batch-retry';
import type { ModelProvider } from './model-client';
import { detectMissingFields, type MissingFieldFinding } from '../rules/missing-fields';
import { lookupAction, type Category, type ConfidenceTier, type RecommendedAction } from '../rules/action-lookup';
import { derivePostPipelineStatus, type ClaimStatus } from '../rules/status';
import { resolveSeverity, type SeverityBand } from '../rules/severity';
import { computeSlaStatus, type SlaStatus } from '../rules/sla';
import { temporaryHeldSince } from '../rules/temporary-hold';

export interface PipelineClaimResult {
  claim_id: string;
  category: Category;
  category_detail: string;
  evidence: string[];
  disputed_medical_necessity: boolean;
  missing_fields: MissingFieldFinding[];
  confidence_tier: ConfidenceTier | null;
  recommendation_narrative: string;
  recommended_action: RecommendedAction;
  severity: SeverityBand;
  status: ClaimStatus;
  sla: SlaStatus;
  /** Set only when the deterministic missing-field check overrode Call 1's category. */
  safety_net_override?: string;
}

export interface ReconciledAnalysis extends AnalysisResult {
  missingFields: MissingFieldFinding[];
  safetyNetOverride?: string;
}

/**
 * Applies the deterministic missing-field safety net to one Call 1 result:
 * whether a required field is actually null is a hard fact, not a judgment
 * call, so a detected material gap overrides the model's category if they
 * disagree.
 */
export function reconcileCategory(claim: GeneratedClaim, analysis: AnalysisResult): ReconciledAnalysis {
  const missingFields = detectMissingFields(claim);
  const hasMaterialGap = missingFields.some((f) => f.material);

  let category = analysis.proposed_category;
  let safetyNetOverride: string | undefined;
  if (hasMaterialGap && category !== 'missing-data') {
    const gapFields = missingFields
      .filter((f) => f.material)
      .map((f) => f.field)
      .join(', ');
    safetyNetOverride = `Deterministic override: Call 1 proposed "${category}", but ${gapFields} is actually null on this claim — a confirmed fact, not inference. Recategorized as missing-data.`;
    category = 'missing-data';
  }

  return { ...analysis, proposed_category: category, missingFields, safetyNetOverride };
}

/**
 * Merges one claim's reconciled Call 1 output with Call 2's confidence
 * result and the deterministic layer (severity, SLA, status, action lookup)
 * — the only step in the Pipeline where a single claim's full result comes
 * together, so both the batched runPipeline() and the Router's single-claim
 * recheck path go through exactly this function.
 */
export function buildClaimResult(
  claim: GeneratedClaim,
  reconciled: ReconciledAnalysis,
  confidence: ConfidenceResult,
  now: Date,
): PipelineClaimResult {
  const materialMissing = reconciled.missingFields.some((f) => f.material);
  const heldSince = temporaryHeldSince(claim, new Date(claim.submitted_date));
  const sla = computeSlaStatus({
    slaTier: claim.sla_tier,
    submittedDate: claim.submitted_date,
    now,
    heldSince,
  });
  const missingFieldIsMaterial = reconciled.proposed_category === 'missing-data' ? materialMissing : undefined;
  const status = derivePostPipelineStatus({
    category: reconciled.proposed_category,
    confidence: confidence.confidence_tier,
    missingFieldIsMaterial,
  });
  // resolveSeverity, not the plain computeSeverity — this is the function
  // that actually implements Section 7b's terminal-status rule (Resolved/
  // Denied always Low, Recoupment Requested always High). Bug found live
  // during Pass A1 (2026-07-31): this call site had never been updated to
  // it, so the real Pipeline's own severity ignored that rule entirely,
  // while the old UI placeholder layer happened to call resolveSeverity
  // directly and masked the gap. status must be computed first now, since
  // resolveSeverity needs it.
  const severity = resolveSeverity({
    status,
    billedAmount: claim.total_charge,
    disputedMedicalNecessity: reconciled.disputed_medical_necessity,
    slaPercentRemaining: sla.percentRemaining,
  });
  const recommendedAction = lookupAction({
    category: reconciled.proposed_category,
    confidence: confidence.confidence_tier ?? undefined,
    missingFieldIsMaterial,
  });

  return {
    claim_id: reconciled.claim_id,
    category: reconciled.proposed_category,
    category_detail: reconciled.category_detail,
    evidence: reconciled.evidence,
    disputed_medical_necessity: reconciled.disputed_medical_necessity,
    missing_fields: reconciled.missingFields,
    confidence_tier: confidence.confidence_tier,
    recommendation_narrative: confidence.recommendation_narrative,
    recommended_action: recommendedAction,
    severity,
    status,
    sla,
    safety_net_override: reconciled.safetyNetOverride,
  };
}

// Phase 13 Pass G — a batch of ~20 claims per call is the scale this
// Pipeline's prompts, maxTokens budgets, and reliability were actually
// measured against (see build CLAUDE.md's Pass G entry: a live diagnostic
// clocked Call 1 at ~516 completion tokens/claim, meaning a single 123-claim
// call would need roughly 63K tokens and ~25 minutes — well past both this
// project's own timeout and Kimi's practical per-request limits). The chunk
// COUNT is derived from claim count (rounded to the nearest whole chunk of
// this target size), not a fixed chunk count, so the 20-claim live-app
// default still runs as a single, unchunked call exactly as before, and
// only actually chunks once there's enough volume to need it.
// Bumped 20 -> 22 (2026-08-06) alongside the 132-claim expansion, specifically
// so 132/22 = 6 exactly — no rounding ambiguity in the numChunks formula below
// (132/20 would round to 7, one more chunk than intended).
//
// Bumped again, 22 -> 14 (2026-08-09), after live visitor reports of a slow
// cold load — since chunks run concurrently (Promise.all below), wall-clock
// time is set by the SLOWEST chunk, not total work, so smaller chunks don't
// obviously help or hurt on their own: fewer claims per chunk means less for
// that chunk to generate, but every chunk still re-pays this Pipeline's own
// large system prompt in full, and more chunks means more independent
// chances for one to need a retry, with the whole batch waiting on it.
// Measured live (scripts/diagnose-token-usage.ts) rather than assumed,
// against the full 132-claim set — 6 chunks (size 22, the prior default):
// 205.8s, clean; 8 (size 16): 342.3s, hit 3 retries on one chunk; 9 (size
// 14): 167.7s and 164.4s across two separate clean trials; 10 (size 13):
// 222.2s, hit 2 retries; 12 (size 11): 258.4s, clean. 9 was the only chunk
// count run twice, specifically to check the first result wasn't a fluke —
// the two trials landed within 3.3s of each other, real confirmation, not
// just one lucky run. 8 and 10 both hit the same transient parse-error
// retry on the same chunk position, which reads as genuine run-to-run
// noise (Promise.all waits on the slowest chunk, so one retry anywhere
// dominates that run's total) rather than something specific to those
// chunk counts — but even so, neither came close to 9's clean numbers. 14
// is not claimed to be the exact global optimum, just the clear best of
// what was actually tested, confirmed twice.
//
// Overridable via PIPELINE_CHUNK_SIZE_OVERRIDE for future live timing
// comparisons (run scripts/diagnose-token-usage.ts with it set) — unset in
// every real deployment, so this changes nothing about normal behavior.
const PIPELINE_TARGET_CHUNK_SIZE = Number(process.env.PIPELINE_CHUNK_SIZE_OVERRIDE) || 14;

export async function runPipeline(
  now: Date = new Date(),
  provider: ModelProvider = 'anthropic',
  claimLimit?: number,
): Promise<PipelineClaimResult[]> {
  const claims = generateClaims(now, claimLimit);
  const providerHistory = getProviderHistory();
  const byId = new Map<string, GeneratedClaim>(claims.map((c) => [c.claim_id, c]));
  // Built once, here, and threaded into both calls explicitly — not
  // independently rebuilt inside each one. Each call's own results can come
  // back in whatever order the model happened to generate them (the very
  // reason withCompletenessRetry exists), so if Call 1 and Call 2 each
  // rebuilt their own registry from their own differently-ordered inputs, a
  // hash collision (vanishingly unlikely, but not assumed away — see
  // claim-number.ts) could in principle resolve differently in each. One
  // shared registry, built from this canonical claims array, closes that off.
  const registry = buildClaimNumberRegistry(claims.map((c) => c.claim_id));

  const numChunks = Math.max(1, Math.round(claims.length / PIPELINE_TARGET_CHUNK_SIZE));

  // Every chunk runs concurrently (Promise.all) — real headroom to do so
  // confirmed against the actual account's Kimi rate-limit tier (Tier 1: 50
  // concurrent requests, 200 RPM), nowhere close to the handful of chunks
  // this claim count produces. withCompletenessRetry (inside runAnalysis/
  // runConfidence) still applies per chunk for an incomplete-but-successful
  // response; withChunkRetry wraps the same call again for the OTHER real
  // failure mode found live at this pass — an outright thrown error (a
  // genuine APIConnectionTimeoutError, confirmed live 2026-08-06) on one
  // chunk otherwise aborts Promise.all entirely, discarding the other
  // chunks' already-succeeded, already-paid-for results too.
  //
  // distributeClaimsForAnalysis, not a plain contiguous slice — claims-seed-
  // data.json's own file order clusters most clean claims at the end, which
  // produced real per-chunk token variance when chunks were just sliced in
  // order (see chunk.ts's header comment). This also keeps every linked pair
  // together in one chunk, load-bearing for cross-claim fraud/complex-math
  // reasoning, not just a distribution nicety.
  const claimChunks = distributeClaimsForAnalysis(claims, numChunks);
  const analysisResultsByChunk = await Promise.all(
    claimChunks.map((chunk, i) =>
      withChunkRetry(() => runAnalysis(chunk, providerHistory, registry, provider), `runPipeline: Call 1 chunk ${i + 1}/${numChunks}`),
    ),
  );
  const analysisResults = analysisResultsByChunk.flat();

  const reconciled = analysisResults.map((r) => {
    const claim = byId.get(r.claim_id);
    if (!claim) {
      throw new Error(`runPipeline: Call 1 returned an unknown claim_id "${r.claim_id}"`);
    }
    return reconcileCategory(claim, r);
  });

  // Re-chunked independently from Call 1's own grouping above — Call 2's
  // findings have no cross-chunk dependency on each other (unlike Call 1's
  // linked-pair requirement), so there's no need to preserve the same claim
  // groupings between the two calls. Bucketed by the real, Call-1-determined
  // category rather than the authored scenario — a more accurate signal by
  // this point, and the only one available anyway (reconciled results carry
  // no _testMeta).
  const reconciledChunks = distributeEvenlyByCategory(reconciled, numChunks, (r) => r.proposed_category);
  const confidenceResultsByChunk = await Promise.all(
    reconciledChunks.map((chunk, i) =>
      withChunkRetry(
        () =>
          runConfidence(
            chunk.map((r) => ({
              claim_id: r.claim_id,
              category: r.proposed_category,
              category_detail: r.category_detail,
              evidence: r.evidence,
            })),
            registry,
            provider,
          ),
        `runPipeline: Call 2 chunk ${i + 1}/${numChunks}`,
      ),
    ),
  );
  const confidenceResults = confidenceResultsByChunk.flat();
  const confidenceById = new Map(confidenceResults.map((r) => [r.claim_id, r]));

  return reconciled.map((r) => {
    const claim = byId.get(r.claim_id)!;
    const confidence = confidenceById.get(r.claim_id);
    if (!confidence) {
      throw new Error(`runPipeline: Call 2 returned no result for claim_id "${r.claim_id}"`);
    }
    return buildClaimResult(claim, r, confidence, now);
  });
}
