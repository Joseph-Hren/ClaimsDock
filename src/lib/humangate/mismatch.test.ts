import { describe, it, expect } from 'vitest';
import { checkRecommendationMismatch } from './mismatch';
import type { PipelineClaimResult } from '../pipeline/orchestrator';

function fixtureResult(overrides: Partial<PipelineClaimResult>): PipelineClaimResult {
  return {
    claim_id: 'TEST-01',
    category: 'clean',
    category_detail: 'no issues found',
    evidence: ['no anomalies detected'],
    disputed_medical_necessity: false,
    missing_fields: [],
    confidence_tier: 'High Confidence',
    recommendation_narrative: 'Clean read, high confidence.',
    recommended_action: 'Approve',
    severity: 'Low',
    status: 'Resolved',
    sla: { windowHours: 720, activeElapsedHours: 10, percentRemaining: 0.9, isBreached: false },
    ...overrides,
  };
}

describe('checkRecommendationMismatch', () => {
  it('does not flag approve when the recommendation was Approve', () => {
    const result = checkRecommendationMismatch(fixtureResult({ recommended_action: 'Approve' }), 'approve');
    expect(result.mismatched).toBe(false);
  });

  it('does not flag approve_with_edit against a complex-math "Approve as calculated" recommendation', () => {
    const result = checkRecommendationMismatch(
      fixtureResult({ recommended_action: 'Approve as calculated' }),
      'approve_with_edit',
    );
    expect(result.mismatched).toBe(false);
  });

  it('flags a human Deny against a recommended Approve, citing evidence and narrative', () => {
    const result = checkRecommendationMismatch(
      fixtureResult({
        recommended_action: 'Approve',
        confidence_tier: 'High Confidence',
        evidence: ['clean provider history', 'diagnosis matches procedure'],
        recommendation_narrative: 'Multiple signals converge on a clean read.',
      }),
      'deny',
    );
    expect(result.mismatched).toBe(true);
    expect(result.message).toContain('Approve');
    expect(result.message).toContain('clean provider history');
    expect(result.message).toContain('Multiple signals converge');
  });

  it('flags a human Approve against a recommended Deny', () => {
    const result = checkRecommendationMismatch(fixtureResult({ recommended_action: 'Deny' }), 'approve');
    expect(result.mismatched).toBe(true);
  });

  it('flags Request Additional Info when nothing is actually missing', () => {
    const result = checkRecommendationMismatch(
      fixtureResult({ category: 'clean', recommended_action: 'Approve' }),
      'request_additional_info',
    );
    expect(result.mismatched).toBe(true);
  });

  it('does not flag Escalate against a recommended Escalate', () => {
    const result = checkRecommendationMismatch(fixtureResult({ recommended_action: 'Escalate' }), 'escalate');
    expect(result.mismatched).toBe(false);
  });
});
