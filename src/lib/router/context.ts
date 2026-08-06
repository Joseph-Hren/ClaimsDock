// Builds the ClaimIndex + provider history Anchor needs, from the same
// cached Pipeline results the homepage already uses (Phase 11 Pass A1/A2) —
// shared here so app/api/anchor/route.ts and scripts/smoke-test-router.ts
// don't each hand-roll the same claims/registry/results/index assembly.

import { generateClaims, getProviderHistory } from '../claims/generate-claims';
import { buildClaimNumberRegistry } from '../claims/claim-number';
import { getCachedPipelineResults } from '../pipeline/cache';
import { buildClaimIndex, type ClaimIndex } from './types';
import type { GeneratedClaim, ProviderHistoryEntry } from '../claims/types';
import type { PipelineClaimResult } from '../pipeline/orchestrator';
import type { ClaimStatus } from '../rules/status';
import type { SeverityBand } from '../rules/severity';

/** Kept for standalone/script use (nothing in the live app calls this
 *  anymore as of Phase 13 Pass A — see buildAnchorContextFromRows below) —
 *  still the right tool for a caller with no client-rendered rows to hand
 *  in, e.g. a future non-UI script. */
export async function buildAnchorContext(now: Date = new Date()): Promise<{
  index: ClaimIndex;
  providerHistory: ProviderHistoryEntry[];
}> {
  const claims = generateClaims(now);
  const registry = buildClaimNumberRegistry(claims.map((c) => c.claim_id));
  const results = await getCachedPipelineResults(now);
  const providerHistory = getProviderHistory();
  const index = buildClaimIndex(claims, results, registry);
  return { index, providerHistory };
}

/** What /api/anchor actually uses (Phase 13 Pass A) — builds Anchor's
 *  ClaimIndex directly from the client's own already-rendered dashboard
 *  rows instead of running an independent getCachedPipelineResults() call.
 *  Two independently-cached Pipeline passes for the same claim could
 *  genuinely disagree (Next.js doesn't share an in-memory/unstable_cache
 *  entry across separately-bundled routes, confirmed live 2026-08-03) — an
 *  Anchor answer and its own citation mini-card showing different
 *  status/severity for the same claim at the same moment. Grounding Anchor
 *  in exactly what the adjuster is already looking at fixes this by
 *  construction, with no caching layer to trust.
 *
 *  A second, narrower version of the same bug found live 2026-08-06, after
 *  Phase 13 Pass C's Human Gate wiring landed (later than this function):
 *  `row.result` is the ORIGINAL Pipeline output, frozen the moment it was
 *  computed — it never reflects a human action (Approve/Deny/Escalate/etc,
 *  persisted client-side via localStorage, see getCurrentClaimState).
 *  `row.status`/`row.severity` are the fields Dashboard's own displayRows
 *  keeps current with those actions; this function was only ever reading
 *  the frozen `result`, so Anchor described a claim's ORIGINAL state
 *  forever, no matter what actually happened to it since. Reproduced twice
 *  live in the same sitting — a just-approved claim ("Resolved: approved"
 *  on screen) that Anchor still called "Needs Approval," and a just-
 *  escalated claim ("Escalated" on screen) that Anchor still called
 *  "Submitted, flagged." Fixed by patching the row's current status/
 *  severity into the result object actually stored in the index, rather
 *  than trusting result's own (stale) copies of those two fields.
 *  recommended_action and sla are deliberately left untouched — the former
 *  is genuinely historical (what the AI recommended, regardless of what a
 *  human later chose to do instead) and the latter isn't kept fresh by
 *  Dashboard's own override either, so patching just SLA here would imply a
 *  freshness guarantee this function still can't actually make. */
export function buildAnchorContextFromRows(
  rows: { claim: GeneratedClaim; displayNumber: string; result: PipelineClaimResult; status: ClaimStatus; severity: SeverityBand }[],
): { index: ClaimIndex; providerHistory: ProviderHistoryEntry[] } {
  const index: ClaimIndex = new Map();
  for (const row of rows) {
    const result: PipelineClaimResult = { ...row.result, status: row.status, severity: row.severity };
    index.set(row.displayNumber, { claim: row.claim, result });
  }
  return { index, providerHistory: getProviderHistory() };
}
