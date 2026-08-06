import { describe, it, expect } from 'vitest';
import { submittedWithinRange, breachingWithinRange } from './stat-range';
import type { DashboardClaimRow } from './dashboard-rows';

// Only the fields submittedWithinRange/breachingWithinRange actually read —
// a full GeneratedClaim/PipelineClaimResult would be pure boilerplate here.
function fixtureRow(overrides: {
  hoursAgo?: number;
  isAutoApproved?: boolean;
  windowHours?: number;
  percentRemaining?: number;
  isBreached?: boolean;
}): DashboardClaimRow {
  const hoursAgo = overrides.hoursAgo ?? 1;
  const submitted = new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  return {
    claim: { submitted_date: submitted } as DashboardClaimRow['claim'],
    isAutoApproved: overrides.isAutoApproved ?? false,
    status: 'Submitted, no flags',
    category: 'clean',
    sla: {
      windowHours: overrides.windowHours ?? 720,
      activeElapsedHours: 0,
      percentRemaining: overrides.percentRemaining ?? 1,
      isBreached: overrides.isBreached ?? false,
    },
  } as DashboardClaimRow;
}

describe('submittedWithinRange', () => {
  const now = new Date();

  it('includes a claim submitted 2 hours ago in "today"', () => {
    const rows = [fixtureRow({ hoursAgo: 2 })];
    expect(submittedWithinRange(rows, 'today', now)).toHaveLength(1);
  });

  it('excludes a claim submitted 3 days ago from "today" but includes it in "7d"', () => {
    const rows = [fixtureRow({ hoursAgo: 72 })];
    expect(submittedWithinRange(rows, 'today', now)).toHaveLength(0);
    expect(submittedWithinRange(rows, '7d', now)).toHaveLength(1);
  });

  it('excludes a claim submitted 40 days ago from "30d"', () => {
    const rows = [fixtureRow({ hoursAgo: 40 * 24 })];
    expect(submittedWithinRange(rows, '30d', now)).toHaveLength(0);
  });
});

describe('breachingWithinRange', () => {
  // Percent-of-window-remaining thresholds (Today <=15%, 7d <=40%, 30d <=70%) — judges an urgent-tier claim (72-hour
  // window) and a standard-tier claim (720-hour window) on the same relative scale, found live 2026-08-06 to matter:
  // an absolute-hours cutoff made "30d" almost indistinguishable from "hasn't breached yet," since 720 hours IS the
  // entire standard-tier window.

  it('includes a claim at 10% remaining under "today" (and 7d, and 30d)', () => {
    const rows = [fixtureRow({ percentRemaining: 0.1 })];
    expect(breachingWithinRange(rows, 'today')).toHaveLength(1);
    expect(breachingWithinRange(rows, '7d')).toHaveLength(1);
    expect(breachingWithinRange(rows, '30d')).toHaveLength(1);
  });

  it('excludes a claim at 25% remaining from "today" but includes it in "7d" and "30d"', () => {
    const rows = [fixtureRow({ percentRemaining: 0.25 })];
    expect(breachingWithinRange(rows, 'today')).toHaveLength(0);
    expect(breachingWithinRange(rows, '7d')).toHaveLength(1);
    expect(breachingWithinRange(rows, '30d')).toHaveLength(1);
  });

  it('excludes a claim at 55% remaining from "today" and "7d" but includes it in "30d"', () => {
    const rows = [fixtureRow({ percentRemaining: 0.55 })];
    expect(breachingWithinRange(rows, 'today')).toHaveLength(0);
    expect(breachingWithinRange(rows, '7d')).toHaveLength(0);
    expect(breachingWithinRange(rows, '30d')).toHaveLength(1);
  });

  it('excludes a claim at 85% remaining from all three ranges — plenty of runway left, not "nearing" anything', () => {
    const rows = [fixtureRow({ percentRemaining: 0.85 })];
    expect(breachingWithinRange(rows, 'today')).toHaveLength(0);
    expect(breachingWithinRange(rows, '7d')).toHaveLength(0);
    expect(breachingWithinRange(rows, '30d')).toHaveLength(0);
  });

  it('excludes an already-breached claim regardless of range', () => {
    const rows = [fixtureRow({ isBreached: true, percentRemaining: -0.1 })];
    expect(breachingWithinRange(rows, '30d')).toHaveLength(0);
  });
});
