// Real Interactive Router / Anchor route (Phase 11 Pass A2) — the
// "router/Anchor query" endpoint CLAUDE.md's file structure has called for
// since Phase 1.
//
// Builds Anchor's ClaimIndex from the client's own already-rendered
// dashboard rows (sent in the request body) rather than an independent
// getCachedPipelineResults() call — Phase 13 Pass A, fixing a real bug
// where an Anchor answer and its own citation mini-card could show
// different status/severity for the same claim, since Next.js doesn't
// share a cache entry across separately-bundled routes. See
// buildAnchorContextFromRows's own comment for the full account.

import { askAnchor } from '../../../lib/router/anchor';
import { buildAnchorContextFromRows } from '../../../lib/router/context';
import type { GeneratedClaim } from '../../../lib/claims/types';
import type { PipelineClaimResult } from '../../../lib/pipeline/orchestrator';
import type { ModelProvider } from '../../../lib/pipeline/model-client';
import type { ClaimStatus } from '../../../lib/rules/status';
import type { SeverityBand } from '../../../lib/rules/severity';

// Must never be statically evaluated at build time — same reasoning as
// /api/pipeline.
export const dynamic = 'force-dynamic';

// status/severity are the row's CURRENT values (Dashboard's displayRows
// keeps these fresh against human actions via getCurrentClaimState) — not
// the same as result.status/result.severity, which are the original
// Pipeline output and never change after a human acts on the claim. Both
// were already arriving in the request body before this type declared
// them; buildAnchorContextFromRows uses them to patch the frozen result
// object before Anchor ever sees it (see that function's own comment for
// the two live bugs this fixes).
type ClientRow = { claim: GeneratedClaim; displayNumber: string; result: PipelineClaimResult; status: ClaimStatus; severity: SeverityBand };
type PriorTurn = { question: string; answer: string };

export async function POST(request: Request) {
  let body: {
    question?: string;
    claimInView?: string;
    selectedClaimIds?: string[];
    rows?: ClientRow[];
    provider?: ModelProvider;
    priorTurn?: PriorTurn;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  if (!body.question || typeof body.question !== 'string') {
    return Response.json({ error: 'Request body must include a "question" string.' }, { status: 400 });
  }
  if (!Array.isArray(body.rows)) {
    return Response.json({ error: 'Request body must include a "rows" array — the currently-displayed dashboard rows.' }, { status: 400 });
  }

  try {
    const { index, providerHistory } = buildAnchorContextFromRows(body.rows);
    const result = await askAnchor(
      body.question,
      { index, providerHistory, now: new Date(), claimInView: body.claimInView, selectedClaimIds: body.selectedClaimIds, priorTurn: body.priorTurn },
      body.provider,
    );
    return Response.json(result);
  } catch (err) {
    console.error('POST /api/anchor failed:', err);
    return Response.json({ error: 'Failed to get an answer from Anchor.' }, { status: 500 });
  }
}
