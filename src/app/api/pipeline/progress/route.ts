// Progressive-loading endpoint (2026-08-10) — the homepage's client-side
// loader (components/DashboardLoader.tsx) polls this instead of awaiting
// /api/pipeline's own single all-or-nothing response. Backed by the exact
// same per-ISO-week cache (getCachedPipelineResults) either way, so polling
// never triggers a second live run just because /api/pipeline's cron
// pre-warm already ran, or another visitor's poll already kicked one off —
// pendingByWeek (cache.ts) already dedupes concurrent callers to one shared
// promise.
//
// Every poll (while not yet known complete) re-attaches a .then to that
// shared promise and returns the current snapshot immediately without
// waiting on it — cheap and idempotent even across many polls, since a
// promise that has already settled just resolves its handler right away.
// This is also what correctly finalizes an already-warm week: on a cache
// hit, progress.ts's startProgress/appendProgress never fire (the
// unstable_cache-wrapped function body is skipped entirely), so this route
// is the only place isComplete/results ever get set for that case, off the
// resolved value itself rather than the side channel.

import { getCachedPipelineResults, getPipelineProgressKey } from '../../../../lib/pipeline/cache';
import { getProgress, completeProgress } from '../../../../lib/pipeline/progress';
import { generateClaims } from '../../../../lib/claims/generate-claims';
import { buildDashboardRowsFromResults } from '../../../../lib/ui/dashboard-rows';

export const dynamic = 'force-dynamic';

export async function GET() {
  const now = new Date();
  const key = getPipelineProgressKey(now);
  const totalExpected = generateClaims(now).length;

  const state = getProgress(key);
  if (!state || !state.isComplete) {
    getCachedPipelineResults(now).then(
      (results) => completeProgress(key, results),
      (err) => console.error('GET /api/pipeline/progress: pipeline run failed:', err),
    );
  }

  const current = getProgress(key);
  return Response.json({
    rows: buildDashboardRowsFromResults(now, current?.results ?? []),
    totalExpected: current?.totalExpected ?? totalExpected,
    isComplete: current?.isComplete ?? false,
  });
}
