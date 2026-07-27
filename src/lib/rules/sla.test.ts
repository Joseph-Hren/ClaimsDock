import { describe, it, expect } from 'vitest';
import { computeSlaStatus, SLA_WINDOW_HOURS } from './sla';

describe('computeSlaStatus', () => {
  it('uses the correct window per tier', () => {
    expect(SLA_WINDOW_HOURS.standard).toBe(720);
    expect(SLA_WINDOW_HOURS.urgent).toBe(72);
  });

  it('reports ~100% remaining for a claim submitted this instant', () => {
    const now = new Date('2026-07-27T12:00:00Z');
    const result = computeSlaStatus({ slaTier: 'standard', submittedDate: now, now });
    expect(result.percentRemaining).toBeCloseTo(1, 5);
    expect(result.isBreached).toBe(false);
  });

  it('reports 50% remaining halfway through a standard window', () => {
    const submitted = new Date('2026-07-12T12:00:00Z'); // 15 days before "now"
    const now = new Date('2026-07-27T12:00:00Z');
    const result = computeSlaStatus({ slaTier: 'standard', submittedDate: submitted, now });
    expect(result.percentRemaining).toBeCloseTo(0.5, 5);
  });

  it('flags a claim past its deadline as breached with a negative percent remaining', () => {
    const submitted = new Date('2026-06-01T12:00:00Z');
    const now = new Date('2026-07-27T12:00:00Z');
    const result = computeSlaStatus({ slaTier: 'standard', submittedDate: submitted, now });
    expect(result.isBreached).toBe(true);
    expect(result.percentRemaining).toBeLessThan(0);
  });

  it('freezes elapsed time at heldSince rather than continuing to now', () => {
    const submitted = new Date('2026-07-01T00:00:00Z');
    const heldSince = new Date('2026-07-03T00:00:00Z'); // 48 hours after submission
    const now = new Date('2026-07-27T00:00:00Z'); // long after — should be ignored
    const result = computeSlaStatus({ slaTier: 'urgent', submittedDate: submitted, now, heldSince });
    expect(result.activeElapsedHours).toBeCloseTo(48, 5);
    // 48 of 72 hours used -> exactly 1/3 remaining
    expect(result.percentRemaining).toBeCloseTo(1 / 3, 5);
  });

  it('never reports negative elapsed time even with a submittedDate in the future', () => {
    const now = new Date('2026-07-27T00:00:00Z');
    const submitted = new Date('2026-07-28T00:00:00Z');
    const result = computeSlaStatus({ slaTier: 'standard', submittedDate: submitted, now });
    expect(result.activeElapsedHours).toBe(0);
  });
});
