import { describe, it, expect } from 'vitest';
import { buildAnchorContextFromRows } from './context';
import type { PipelineClaimResult } from '../pipeline/orchestrator';
import type { GeneratedClaim } from '../claims/types';

function fixtureResult(overrides: Partial<PipelineClaimResult> = {}): PipelineClaimResult {
  return {
    claim_id: 'CLM-TEST',
    category: 'ambiguous',
    category_detail: 'test detail',
    evidence: ['test evidence'],
    disputed_medical_necessity: false,
    missing_fields: [],
    confidence_tier: 'Confident',
    recommendation_narrative: 'test narrative',
    recommended_action: 'Escalate',
    severity: 'Moderate',
    status: 'Submitted, flagged',
    sla: { windowHours: 720, activeElapsedHours: 72, percentRemaining: 90, isBreached: false },
    ...overrides,
  };
}

const fixtureClaim = { claim_id: 'CLM-TEST' } as GeneratedClaim;

describe('buildAnchorContextFromRows', () => {
  it('uses the row\'s CURRENT status/severity, not result\'s own frozen copies (the real bug: an approved claim Anchor still called "Needs Approval")', () => {
    const { index } = buildAnchorContextFromRows([
      {
        claim: fixtureClaim,
        displayNumber: 'CLM-1111-111111',
        result: fixtureResult({ status: 'Needs Approval', severity: 'Moderate' }),
        status: 'Resolved',
        severity: 'Low',
      },
    ]);

    const entry = index.get('CLM-1111-111111');
    expect(entry?.result.status).toBe('Resolved');
    expect(entry?.result.severity).toBe('Low');
  });

  it('reproduces the second live case: an escalated claim Anchor still called "Submitted, flagged"', () => {
    const { index } = buildAnchorContextFromRows([
      {
        claim: fixtureClaim,
        displayNumber: 'CLM-2222-222222',
        result: fixtureResult({ status: 'Submitted, flagged', severity: 'Moderate' }),
        status: 'Escalated',
        severity: 'Moderate',
      },
    ]);

    expect(index.get('CLM-2222-222222')?.result.status).toBe('Escalated');
  });

  it('leaves recommended_action and every other result field untouched — only status/severity are patched', () => {
    const { index } = buildAnchorContextFromRows([
      {
        claim: fixtureClaim,
        displayNumber: 'CLM-3333-333333',
        result: fixtureResult({ status: 'Needs Approval', recommended_action: 'Approve', category: 'fraud' }),
        status: 'Denied',
        severity: 'Low',
      },
    ]);

    const result = index.get('CLM-3333-333333')?.result;
    expect(result?.recommended_action).toBe('Approve');
    expect(result?.category).toBe('fraud');
    expect(result?.status).toBe('Denied');
  });
});
