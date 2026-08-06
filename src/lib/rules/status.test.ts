import { describe, it, expect } from 'vitest';
import { deriveInitialStatus, derivePostPipelineStatus, isRecommendationFulfilled, recommendationDisplayLabel } from './status';

describe('deriveInitialStatus', () => {
  it('flags fraud and ambiguous immediately, by category alone', () => {
    expect(deriveInitialStatus({ category: 'fraud' })).toBe('Submitted, flagged');
    expect(deriveInitialStatus({ category: 'ambiguous' })).toBe('Submitted, flagged');
  });

  it('does not flag clean or complex-math — Approve is always reachable for these', () => {
    expect(deriveInitialStatus({ category: 'clean' })).toBe('Submitted, no flags');
    expect(deriveInitialStatus({ category: 'complex-math' })).toBe('Submitted, no flags');
  });

  it('flags missing-data only when the gap is material', () => {
    expect(deriveInitialStatus({ category: 'missing-data', missingFieldIsMaterial: true })).toBe('Submitted, flagged');
    expect(deriveInitialStatus({ category: 'missing-data', missingFieldIsMaterial: false })).toBe('Submitted, no flags');
  });

  it('throws if missing-data is looked up without stating materiality', () => {
    expect(() => deriveInitialStatus({ category: 'missing-data' })).toThrow();
  });
});

describe('derivePostPipelineStatus', () => {
  it('auto-approves a clean claim with High Confidence or Confident', () => {
    expect(derivePostPipelineStatus({ category: 'clean', confidence: 'High Confidence' })).toBe('Resolved');
    expect(derivePostPipelineStatus({ category: 'clean', confidence: 'Confident' })).toBe('Resolved');
  });

  it('sends a clean claim to Needs Approval when confidence is Suspected or Uncertain', () => {
    expect(derivePostPipelineStatus({ category: 'clean', confidence: 'Suspected' })).toBe('Needs Approval');
    expect(derivePostPipelineStatus({ category: 'clean', confidence: 'Uncertain' })).toBe('Needs Approval');
  });

  it('always sends complex-math to Needs Approval, regardless of (null) confidence', () => {
    expect(derivePostPipelineStatus({ category: 'complex-math', confidence: null })).toBe('Needs Approval');
  });

  it('keeps fraud and ambiguous flagged regardless of confidence', () => {
    expect(derivePostPipelineStatus({ category: 'fraud', confidence: 'High Confidence' })).toBe('Submitted, flagged');
    expect(derivePostPipelineStatus({ category: 'ambiguous', confidence: 'Uncertain' })).toBe('Submitted, flagged');
  });

  it('applies the same auto-approval/Needs-Approval split to a non-material missing-data gap', () => {
    expect(
      derivePostPipelineStatus({ category: 'missing-data', confidence: 'High Confidence', missingFieldIsMaterial: false }),
    ).toBe('Resolved');
    expect(
      derivePostPipelineStatus({ category: 'missing-data', confidence: 'Suspected', missingFieldIsMaterial: false }),
    ).toBe('Needs Approval');
  });

  it('keeps a material missing-data gap flagged regardless of confidence', () => {
    expect(
      derivePostPipelineStatus({ category: 'missing-data', confidence: 'High Confidence', missingFieldIsMaterial: true }),
    ).toBe('Submitted, flagged');
  });
});

describe('isRecommendationFulfilled', () => {
  // Both live reproductions, 2026-08-06: a manually-approved complex-math
  // claim and a manually-escalated claim both kept showing their original
  // recommendation as if still an open ask, on the Claims Card and in
  // Anchor's own answers alike.
  it('treats a claim as fulfilled once its status matches what the recommendation would produce, however it got there', () => {
    expect(isRecommendationFulfilled('Approve as calculated', 'Resolved')).toBe(true);
    expect(isRecommendationFulfilled('Approve', 'Resolved')).toBe(true);
    expect(isRecommendationFulfilled('Escalate', 'Escalated')).toBe(true);
    expect(isRecommendationFulfilled('Deny', 'Denied')).toBe(true);
    expect(isRecommendationFulfilled('Request Additional Info', 'Additional Info Requested')).toBe(true);
  });

  it('treats an approved claim under recoupment as still fulfilling the original Approve recommendation', () => {
    expect(isRecommendationFulfilled('Approve', 'Recoupment Requested')).toBe(true);
  });

  it('is false while the recommendation is still outstanding', () => {
    expect(isRecommendationFulfilled('Escalate', 'Submitted, flagged')).toBe(false);
    expect(isRecommendationFulfilled('Approve as calculated', 'Needs Approval')).toBe(false);
  });

  it('is false when a human overrode the recommendation with a different action, not fulfilled it', () => {
    expect(isRecommendationFulfilled('Approve', 'Denied')).toBe(false);
    expect(isRecommendationFulfilled('Escalate', 'Resolved')).toBe(false);
  });
});

describe('recommendationDisplayLabel', () => {
  it('returns the live recommendation unchanged while still outstanding', () => {
    expect(recommendationDisplayLabel('Escalate', 'Submitted, flagged')).toBe('Escalate');
    expect(recommendationDisplayLabel('Approve as calculated', 'Needs Approval')).toBe('Approve as calculated');
  });

  it('gives Escalated, Additional Info Requested, and Recoupment Requested their own real-world label rather than a generic "No action needed"', () => {
    expect(recommendationDisplayLabel('Escalate', 'Escalated')).toBe('None: awaiting further review');
    expect(recommendationDisplayLabel('Request Additional Info', 'Additional Info Requested')).toBe('None: on hold pending further info');
    expect(recommendationDisplayLabel('Approve', 'Recoupment Requested')).toBe('None: recoupment request in progress');
  });

  it('falls back to the plain "No action needed" for every other fulfilled case', () => {
    expect(recommendationDisplayLabel('Approve', 'Resolved')).toBe('No action needed');
    expect(recommendationDisplayLabel('Approve as calculated', 'Resolved')).toBe('No action needed');
    expect(recommendationDisplayLabel('Deny', 'Denied')).toBe('No action needed');
  });
});
