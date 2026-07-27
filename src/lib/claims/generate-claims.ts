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

function getISOWeekSeed(date: Date): number {
  // ISO 8601 week number, Thursday-anchored — standard algorithm.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  // Fold ISO year + week into a single numeric seed (e.g. 2026-W30 -> 202630).
  return d.getUTCFullYear() * 100 + weekNum;
}

export function generateClaims(now: Date = new Date()): GeneratedClaim[] {
  const seed = getISOWeekSeed(now);
  const rand = mulberry32(seed);
  const claims = (claimsData as { claims: Claim[] }).claims;

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
