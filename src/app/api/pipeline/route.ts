// Real Evaluation Pipeline route (Phase 11 Pass A1) — the "pipeline run"
// endpoint CLAUDE.md's file structure has called for since Phase 1. The
// homepage (app/page.tsx) calls buildDashboardRows() directly rather than
// self-fetching this route (a Server Component calling a server-side
// function directly has no reason to round-trip through its own HTTP
// endpoint) — this route exists as a real, independently-callable one for
// any other caller (a future manual refresh action, external tooling, etc.).
// Backed by the same per-ISO-week cache either way, so it's never paying for
// a second live run just because two callers asked in the same week.

import { buildDashboardRows } from '../../../lib/ui/dashboard-rows';

// Same reason as page.tsx's identical directive — this must never be
// statically evaluated at build time.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await buildDashboardRows();
    return Response.json({ rows });
  } catch (err) {
    console.error('GET /api/pipeline failed:', err);
    return Response.json({ error: 'Failed to run the Evaluation Pipeline.' }, { status: 500 });
  }
}
