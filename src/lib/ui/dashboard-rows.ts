// Real Pipeline-backed dashboard data (Phase 11 Pass A1) — replaces
// dashboard-placeholder-data.ts now that the Evaluation Pipeline is wired to
// a live, cached route. category, confidence, disputed-medical-necessity,
// evidence, and the recommendation narrative all come from a real Call 1/
// Call 2 run now (getCachedPipelineResults, Phase 7's per-ISO-week cache) —
// nothing here is a stand-in. isAutoApproved is the one genuinely UI-only
// derivation left: it distinguishes "Resolved: auto-approved" from
// "Resolved: approved" for the badge label, which the Pipeline's own output
// has no reason to carry.

import { generateClaims } from '../claims/generate-claims';
import { buildClaimNumberRegistry } from '../claims/claim-number';
import { getCachedPipelineResults } from '../pipeline/cache';
import type { PipelineClaimResult } from '../pipeline/orchestrator';
import { getMemberBenefitStatus } from '../rules/coverage-lookup';
import type { Claim, GeneratedClaim } from '../claims/types';
import { deriveInitialStatus, type ClaimStatus } from '../rules/status';
import type { SeverityBand } from '../rules/severity';
import type { SlaStatus } from '../rules/sla';
import type { Category, ConfidenceTier, RecommendedAction } from '../rules/action-lookup';

export interface DashboardClaimRow {
  claim: GeneratedClaim;
  /** Opaque, realistic-looking claim number — the only claim identifier ever
   *  shown to an adjuster or sent to a model. The real claim.claim_id stays
   *  internal-only (project-spec.txt Section 7d, Phase 11 Pass A0). */
  displayNumber: string;
  /** The full Pipeline output this row was derived from, carried alongside
   *  the flattened fields below rather than replacing them — added Phase 13
   *  Pass A so /api/anchor can rebuild Anchor's ClaimIndex from the client's
   *  already-rendered rows (sent back on every question) instead of running
   *  its own independent Pipeline pass. Two independently-cached passes for
   *  the same claim could genuinely disagree (Next.js doesn't share an
   *  in-memory/unstable_cache entry across separately-bundled routes,
   *  confirmed live 2026-08-03) — an Anchor answer and its own citation
   *  mini-card showing different status/severity for the same claim at the
   *  same moment. Grounding Anchor in the exact data the adjuster is already
   *  looking at fixes this by construction, with no caching layer to trust. */
  result: PipelineClaimResult;
  linkedDisplayNumber: string | null;
  patientName: string;
  providerName: string;
  /** The Pipeline's real, reconciled category — supersedes claim._testMeta
   *  .scenario (the authored answer key) for every display purpose, since
   *  the two can legitimately disagree (a safety-net override, or the model
   *  simply reading the evidence differently than the claim was authored). */
  category: Category;
  evidence: string[];
  recommendationNarrative: string;
  /** The same two raw facts fed to Call 1 (Pass A1) — shown on the card so
   *  an adjuster can verify any evidence citing them independently, rather
   *  than taking the model's word for it. */
  deductibleRemaining: number;
  isInNetwork: boolean;
  inpatientDaysUsedThisPlanYear: number;
  annualInpatientDayCap: number;
  status: ClaimStatus;
  isAutoApproved: boolean;
  severity: SeverityBand;
  confidence: ConfidenceTier | null;
  recommendedAction: RecommendedAction;
  sla: SlaStatus;
}

function providerNameOf(claim: Claim): string {
  return claim.form_type === 'CMS-1500' ? (claim.box33_billing_provider.name ?? '(missing)') : claim.billing_provider_name;
}

export async function buildDashboardRows(now: Date = new Date()): Promise<DashboardClaimRow[]> {
  const claims = generateClaims(now);
  const registry = buildClaimNumberRegistry(claims.map((c) => c.claim_id));
  const results = await getCachedPipelineResults(now);
  const resultsById = new Map(results.map((r) => [r.claim_id, r]));

  return claims.map((claim) => {
    const result = resultsById.get(claim.claim_id);
    if (!result) {
      throw new Error(`buildDashboardRows: no Pipeline result for claim_id "${claim.claim_id}"`);
    }

    const missingFieldIsMaterial =
      result.category === 'missing-data' ? result.missing_fields.some((f) => f.material) : undefined;
    const isAutoApproved =
      result.status === 'Resolved' &&
      deriveInitialStatus({ category: result.category, missingFieldIsMaterial }) === 'Submitted, no flags';
    const benefitStatus = getMemberBenefitStatus(claim);

    return {
      claim,
      displayNumber: registry.toDisplay(claim.claim_id),
      result,
      linkedDisplayNumber: claim.linked_claim_id ? registry.toDisplay(claim.linked_claim_id) : null,
      patientName: claim.patient.name,
      providerName: providerNameOf(claim),
      category: result.category,
      evidence: result.evidence,
      recommendationNarrative: result.recommendation_narrative,
      deductibleRemaining: benefitStatus.deductibleRemaining,
      isInNetwork: benefitStatus.isInNetwork,
      inpatientDaysUsedThisPlanYear: benefitStatus.inpatientDaysUsedThisPlanYear,
      annualInpatientDayCap: benefitStatus.annualInpatientDayCap,
      status: result.status,
      isAutoApproved,
      severity: result.severity,
      confidence: result.confidence_tier,
      recommendedAction: result.recommended_action,
      sla: result.sla,
    };
  });
}
