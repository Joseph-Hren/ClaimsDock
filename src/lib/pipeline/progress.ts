// In-memory, per-key progress tracker for a live Pipeline run (2026-08-10) —
// the side channel that lets /api/pipeline/progress report a partial claims
// list while a cold run is still in flight, without threading a callback
// through cache.ts's unstable_cache-wrapped function (whose own arguments
// become part of its cache key, so a function argument there is a real risk,
// not just style). This module is never involved in cache.ts's caching
// decision — it is purely an observability side channel a caller can poll.
//
// Same accepted limitation as cache.ts's own pendingByWeek Map: in-memory,
// per-process, correct for one warm Vercel Fluid Compute instance, not
// shared across cold instances. A cold instance simply reports "nothing
// tracked yet" until its own first poll kicks off a real (possibly
// cache-hit) computation — never wrong, just not aware of another
// instance's progress.

import type { PipelineClaimResult } from './orchestrator';

export interface PipelineProgress {
  results: PipelineClaimResult[];
  totalExpected: number;
  isComplete: boolean;
}

const progressByKey = new Map<string, PipelineProgress>();

/** Called once, at the start of a real (cache-miss) run, so early polls see a real totalExpected instead of guessing. */
export function startProgress(key: string, totalExpected: number): void {
  progressByKey.set(key, { results: [], totalExpected, isComplete: false });
}

/** Called as each chunk of a real run finishes — appends, never replaces, since chunks land in whatever order they finish. */
export function appendProgress(key: string, chunkResults: PipelineClaimResult[]): void {
  const state = progressByKey.get(key);
  if (!state) return;
  state.results.push(...chunkResults);
}

/**
 * Marks a key's run finished, overwriting `results` with the authoritative
 * final array — called unconditionally once the underlying cached promise
 * resolves, whether that promise ran a real computation (appendProgress
 * already built the same list incrementally) or was a cache hit (nothing
 * above ever ran, so this is the only place `results` gets populated at
 * all). Either way this is the correct final state, not just a fallback.
 */
export function completeProgress(key: string, results: PipelineClaimResult[]): void {
  progressByKey.set(key, { results, totalExpected: results.length, isComplete: true });
}

export function getProgress(key: string): PipelineProgress | undefined {
  return progressByKey.get(key);
}

/** Test-only escape hatch — mirrors cache.ts's clearPipelineCache. */
export function clearPipelineProgress(): void {
  progressByKey.clear();
}
