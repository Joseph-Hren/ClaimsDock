// Seeded claim generator — project-spec.txt Section 11.
//
// Only submitted_date is computed here. Every other field on a claim is fixed,
// authored content living in claims-seed-data.json. The seed is derived from the
// current ISO week number, so the same 20 claims regenerate with the same relative
// urgency spread all week, and shift to a fresh (but still deterministic) spread
// the moment the ISO week changes — no manual reset, no scheduled job.

import claimsData from './claims-seed-data.json';
import providerHistoryData from './provider-history.json';
import type { Claim, GeneratedClaim, ProviderHistoryEntry, UrgencyTarget } from './types';
import { getISOWeekKey } from './iso-week';

const SLA_WINDOW_HOURS: Record<'standard' | 'urgent', number> = {
  standard: 30 * 24, // 30 days
  urgent: 72,
};

// Fraction of the SLA window elapsed, per urgency target. The generator picks a
// random point inside the target's band (seeded, not left to true randomness) —
// this is what "fresh" vs "near_deadline" vs "breached" actually means in practice.
const URGENCY_BANDS: Record<UrgencyTarget, [number, number]> = {
  fresh: [0.02, 0.15],
  mid: [0.3, 0.6],
  near_deadline: [0.8, 0.95],
  breached: [1.05, 1.3],
};

// mulberry32 — a small, standard deterministic PRNG. Same seed always produces the
// same sequence; chosen over a library dependency because the whole algorithm is a
// few lines and this project needs nothing more than that.
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A temporary cap lived here from Pass F's 20->123 claim jump (2026-08-06)
// until Pass G's chunked-batching design landed — generateClaims() used to
// silently limit every live caller to the first 20 authored claims so the
// (then-unsolved) Pipeline timeout at full volume never got triggered by
// just loading the app. Pass G's real fix (orchestrator.ts's chunked,
// evenly-distributed, retry-wrapped batching) is now live and proven at full
// scale, so the cap is gone — `limit` still exists as an optional override
// (e.g. a smaller manual test run), defaulting to the full authored set.
export function generateClaims(now: Date = new Date(), limit: number = Infinity): GeneratedClaim[] {
  const seed = getISOWeekKey(now);
  const rand = mulberry32(seed);
  const claims = (claimsData as { claims: Claim[] }).claims.slice(0, limit);

  return claims.map((claim) => {
    const [lo, hi] = URGENCY_BANDS[claim.urgency_target];
    const fraction = lo + rand() * (hi - lo);
    const windowHours = SLA_WINDOW_HOURS[claim.sla_tier];
    const elapsedHours = fraction * windowHours;
    const submitted = new Date(now.getTime() - elapsedHours * 60 * 60 * 1000);
    return { ...claim, submitted_date: submitted.toISOString() };
  });
}

export function getProviderHistory(): ProviderHistoryEntry[] {
  return (providerHistoryData as { providers: ProviderHistoryEntry[] }).providers;
}
