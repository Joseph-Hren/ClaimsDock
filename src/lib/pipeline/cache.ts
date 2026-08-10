// The real per-ISO-week Pipeline cache — project-spec.txt Section 1/11:
// evidence, confidence, and recommendation depend only on claim data and the
// current week's seed, not on who's viewing, so they're computed once per
// week and shared. Phases 5 and 6 both stood in with "call runPipeline()
// once per test run" — this is the real thing, built in Phase 7 because the
// audit log needs a *stable* snapshot to log against (the Pipeline is
// genuinely nondeterministic run-to-run, observed directly in Phase 5/6
// testing — recomputing on every read would mean "what the system found"
// silently changes underneath an open audit trail).
//
// In-memory, keyed by ISO week, deliberately simple rather than reaching for
// Next.js's Data Cache: this version is testable with a bare script the same
// way every other phase has been, and is correct for the lifetime of one
// process. On Vercel's Fluid Compute model a warm instance serves this
// correctly across requests; a cold start after inactivity recomputes —
// upgrading to Next.js's `unstable_cache` for cross-invocation durability is
// a deliberate, flagged follow-up for whenever this is actually wired into
// app/ (Phase 8/9), not a gap being silently ignored.
//
// A related limitation found live during Pass A1: this module's cache/pending
// variables were NOT shared between app/page.tsx, app/api/pipeline/route.ts,
// and app/api/anchor/route.ts in the built app — Turbopack bundles each
// route separately, and each bundle got its own instantiation of this
// module, confirmed by watching /api/pipeline trigger its own independent
// live Pipeline run even after the homepage had already populated "the"
// cache. Originally noted as low-priority ("harmless, nothing calls that
// route yet") — no longer true as of Pass A3: with the Anchor panel wired to
// /api/anchor, this caused a real, confirmed, user-visible bug — an Anchor
// answer and its own citation mini-card showed *different* status/severity
// for the same claim at the same moment, because the answer came from
// /api/anchor's own independent (genuinely non-deterministic) Pipeline pass
// while the mini-card came from the homepage's separate one, with nothing
// indicating to the user that the two had disagreed.
//
// Fixed 2026-08-03 (Phase 13 Pass A) by switching from a plain module-scope
// variable to unstable_cache: its storage lives in Next's own
// framework-managed cache, not a bundle's module closure, so every caller
// hits the same entry by cache key regardless of which separately-compiled
// bundle calls it. `use cache` (Next 16's newer idiom) was considered and
// rejected for this specific fix — it requires opting into
// `cacheComponents: true` app-wide, a much bigger blast radius (affects
// prerendering/dynamic behavior on every route) than warranted for a bug
// scoped to one function. unstable_cache is deprecated in favor of it but
// still fully supported, and is a contained, low-risk swap.
//
// This does NOT solve true cross-cold-instance sharing in a scaled
// serverless deployment (separate Lambda instances share no memory
// regardless of caching API — only an external store like Redis/KV would
// guarantee that, and that's against this project's no-external-infra
// stance). That remains the same accepted, already-documented limitation
// described above (Fluid Compute warm instances vs. a cold start
// recomputing) — not a new gap this fix introduces.
//
// A subtlety: unstable_cache uses a wrapped function's own ARGUMENTS as
// part of its cache key by default (undocumented for `now: Date`'s exact
// precision, but confirmed via cache.test.ts's own "same ISO week, different
// exact Date -> one shared computation" expectation, which requires the
// literal millisecond-precise `now` to NOT bust the cache). So the
// isoWeek-keyed function below takes only the numeric isoWeek as its
// argument — never the raw `now` — and reconstructs a stable anchor date
// (that week's Thursday, matching getISOWeekKey's own ISO 8601 anchor day)
// for runPipeline/generateClaims to compute relative dates against. Since
// generateClaims's own PRNG seed is derived purely from isoWeek (see
// generate-claims.ts), this changes nothing about which scenarios/urgency
// bands get assigned — only the exact "submitted N hours ago" timestamp
// shifts slightly depending on the anchor moment, a display-only concern.
// This also makes claim data fully reproducible per ISO week rather than
// depending on whichever caller's `now` happened to trigger the first
// computation that week — a small, deliberate tightening of the
// "ISO-week-seeded" contract (project-spec.txt Section 11), not an
// incidental side effect.

import { unstable_cache } from 'next/cache';
import { getISOWeekKey } from '../claims/iso-week';
import { generateClaims } from '../claims/generate-claims';
import { runPipeline, type PipelineClaimResult } from './orchestrator';
import { startProgress, appendProgress } from './progress';

// A cheap fingerprint of the claims the live Pipeline is actually about to
// process (generateClaims()'s own output — the full authored set now that
// Pass G's chunked batching handles it at scale, previously a smaller capped
// subset) — passed as an explicit argument below so it becomes part of
// unstable_cache's own key (see this file's header comment: arguments, not
// just the isoWeek, are what the cache keys off). Needed because
// `revalidate: false` never expires an entry on its own, and the only other
// input, isoWeek, doesn't change when claims-seed-data.json's static content
// does — found live 2026-08-06 when Phase 13 Pass F's jump from 20 to 123
// authored claims left a same-week cache entry with no result for any of the
// new claims, crashing the whole worklist on the very first one
// (`buildDashboardRows: no Pipeline result for claim_id "FRD-PHANTOM-02"`).
function seedFingerprint(now: Date): string {
  const ids = generateClaims(now).map((c) => c.claim_id);
  return `${ids.length}:${ids.join(',')}`;
}

// Inverse of getISOWeekKey: reconstructs a representative Date (that ISO
// week's Thursday, UTC) from the folded `year*100 + weekNum` key it
// produces. Round-trip-verified in cache.test.ts.
function isoWeekAnchorDate(isoWeekKey: number): Date {
  const isoYear = Math.floor(isoWeekKey / 100);
  const weekNum = isoWeekKey % 100;
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayNum = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4.getTime() - (jan4DayNum - 1) * 86400000);
  const targetMonday = new Date(week1Monday.getTime() + (weekNum - 1) * 7 * 86400000);
  return new Date(targetMonday.getTime() + 3 * 86400000);
}

// Routed to Kimi (2026-08-02), not Claude's own default — a real decision,
// not a placeholder. Phase 12's live testing (see build-log) found Kimi
// meaningfully less accurate and less safe than Claude on this exact task
// (82% vs 92% category accuracy; a ~13% vs ~5% silent-miss rate — claims
// that are wrong AND confident enough to auto-resolve with no human ever
// reviewing them) but far cheaper per call and, once its own real bugs were
// fixed, at least as reliable run-to-run. For a public portfolio prototype
// with no real patients, providers, or dollars on the line, that tradeoff
// favors cost; project-spec.txt's own Non-Goals are explicit that this
// would be a materially different call for an actual production system.
const PIPELINE_PROVIDER = 'kimi' as const;

const getResultsForIsoWeek = unstable_cache(
  // seedFingerprint's first job is still just being a distinct argument
  // value so a changed seed set produces a distinct cache key (see
  // seedFingerprint's own comment above) — its second, added 2026-08-10, is
  // forming the exact same pendingKey getCachedPipelineResults below uses,
  // so progress.ts's side channel and the real cache key never drift apart.
  // This function body only runs on a genuine cache miss — a cache hit skips
  // it entirely, meaning startProgress/appendProgress never fire for an
  // already-warm week. That's fine: /api/pipeline/progress finalizes
  // progress unconditionally off this same function's returned promise,
  // hit or miss alike (see that route).
  async (isoWeek: number, seedFingerprint: string): Promise<PipelineClaimResult[]> => {
    const progressKey = `${isoWeek}:${seedFingerprint}`;
    const claims = generateClaims(isoWeekAnchorDate(isoWeek));
    startProgress(progressKey, claims.length);
    return runPipeline(isoWeekAnchorDate(isoWeek), PIPELINE_PROVIDER, undefined, (chunkResults) => {
      appendProgress(progressKey, chunkResults);
    });
  },
  ['pipeline-results-by-iso-week'],
  { revalidate: false },
);

// A same-process guard on top of unstable_cache: a burst of simultaneous
// callers for the same uncached week (before that week's cache entry
// exists) would otherwise each trigger their own runPipeline() call before
// any of them resolves. Deliberately NOT a fix for the cross-bundle problem
// above (this Map is itself per-bundle) — purely an extra dedup layer for
// genuinely concurrent same-process requests, same as the old code's own
// `pending` variable.
const pendingByWeek = new Map<string, Promise<PipelineClaimResult[]>>();

/** Same key shape as getCachedPipelineResults' own pendingKey — the join between this file's cache and progress.ts's side channel. */
export function getPipelineProgressKey(now: Date): string {
  return `${getISOWeekKey(now)}:${seedFingerprint(now)}`;
}

export async function getCachedPipelineResults(now: Date = new Date()): Promise<PipelineClaimResult[]> {
  const isoWeek = getISOWeekKey(now);
  const fingerprint = seedFingerprint(now);
  const pendingKey = `${isoWeek}:${fingerprint}`;

  const existing = pendingByWeek.get(pendingKey);
  if (existing) {
    return existing;
  }

  const promise = getResultsForIsoWeek(isoWeek, fingerprint).finally(() => {
    pendingByWeek.delete(pendingKey);
  });
  pendingByWeek.set(pendingKey, promise);
  return promise;
}

/** Test-only escape hatch — clears the in-memory cache between test cases. */
export function clearPipelineCache(): void {
  pendingByWeek.clear();
}
