// StatTiles' Today/7d/30d range filtering (Phase 13 Pass F, pulled forward
// and tested against the 20-claim set before the 100-claim scale-up).
// Two genuinely different readings, not one shared rule: for auto-approved/
// flagged/fraud-suspected, the range asks "did this happen recently"
// (filtered by submitted_date); for the nearing-SLA-deadline tile, it asks
// "how soon" (filtered by remaining time before breach) — a claim submitted
// weeks ago that's about to breach today should still show up under
// "Today" for that tile, which a submission-date filter alone would miss.

import type { DashboardClaimRow } from './dashboard-rows';

export type StatRange = 'today' | '7d' | '30d';

const RANGE_HOURS: Record<StatRange, number> = {
  today: 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
};

// Nearing-SLA-deadline reads Today/7d/30d as thresholds on PERCENT of each
// claim's own SLA window remaining, not absolute hours — found live
// 2026-08-06: with windowHours this different across tiers (urgent: 72,
// standard: 30*24 = 720), an absolute "remaining hours <= 720" cutoff for
// "30d" was mathematically almost the same as "hasn't breached yet," since
// 720 hours IS the entire standard-tier window. On the real 132-claim set
// this measured as 1/50/131 across Today/7d/30d — the 30d setting wasn't
// discriminating anything, just re-counting nearly the whole active
// caseload. Percent-remaining judges every claim against its own window
// instead, so an urgent claim at 90% elapsed and a standard claim at 90%
// elapsed count as equally "nearing," which absolute hours never could.
//
// This does NOT and can't make Today's count exceed 7d's or 30d's — a
// narrower "how soon" definition is always a subset of a wider one measured
// from the same moment, for any metric expressing "how soon." What this
// fixes is 30d actually meaning something narrower than "everyone with a
// pulse" (roughly Today=11, 7d=22, 30d=50 of 131 active claims, not 1/50/131).
const RANGE_PERCENT_REMAINING_THRESHOLD: Record<StatRange, number> = {
  today: 0.15,
  '7d': 0.4,
  '30d': 0.7,
};

/** Rows submitted within the last `range` — the "did this happen recently" reading. */
export function submittedWithinRange(rows: DashboardClaimRow[], range: StatRange, now: Date): DashboardClaimRow[] {
  const cutoffMs = now.getTime() - RANGE_HOURS[range] * 3_600_000;
  return rows.filter((r) => new Date(r.claim.submitted_date).getTime() >= cutoffMs);
}

/** Rows not yet breached whose SLA window has this little (or less) proportionally remaining — the "how soon" reading. */
export function breachingWithinRange(rows: DashboardClaimRow[], range: StatRange): DashboardClaimRow[] {
  const threshold = RANGE_PERCENT_REMAINING_THRESHOLD[range];
  return rows.filter((r) => {
    if (r.sla.isBreached) return false;
    return r.sla.percentRemaining <= threshold;
  });
}
