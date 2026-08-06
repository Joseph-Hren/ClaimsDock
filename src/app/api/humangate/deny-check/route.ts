// The Human Gate's one real model call (Section 4a(b), Phase 13 Pass C) —
// checkDenialJustificationQuality needs a server-side model client, so it
// can't run directly from the Deny overlay the way
// checkRecommendationMismatch/submitHumanAction do (both pure, client-side).
// Takes the claim's already-computed PipelineClaimResult straight from the
// client's own dashboard row (same pattern as /api/anchor) rather than an
// independent cache read. Defaults to Kimi (guardrails.ts) — no Settings-
// panel toggle for this one yet, unlike Anchor's, but `provider` is accepted
// here too so one exists to wire up later without another route change.

import { checkDenialJustificationQuality } from '../../../../lib/humangate/guardrails';
import type { PipelineClaimResult } from '../../../../lib/pipeline/orchestrator';
import type { DenialJustification } from '../../../../lib/humangate/types';
import type { ModelProvider } from '../../../../lib/pipeline/model-client';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: { pipelineResult?: PipelineClaimResult; denialJustification?: DenialJustification; provider?: ModelProvider };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  if (!body.pipelineResult) {
    return Response.json({ error: 'Request body must include "pipelineResult".' }, { status: 400 });
  }
  if (!body.denialJustification) {
    return Response.json({ error: 'Request body must include "denialJustification".' }, { status: 400 });
  }

  try {
    const result = await checkDenialJustificationQuality(body.pipelineResult, body.denialJustification, body.provider);
    return Response.json(result);
  } catch (err) {
    console.error('POST /api/humangate/deny-check failed:', err);
    return Response.json({ error: 'Failed to check the denial justification.' }, { status: 500 });
  }
}
