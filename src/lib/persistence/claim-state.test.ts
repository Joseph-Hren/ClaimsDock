// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { getCurrentClaimState } from './claim-state';
import { appendAuditEntry, clearAuditLog } from './local-store';
import type { GeneratedClaim } from '../claims/types';
import type { PipelineClaimResult } from '../pipeline/orchestrator';

function fixtureClaim(overrides: Partial<GeneratedClaim> = {}): GeneratedClaim {
  return {
    claim_id: 'TEST-01',
    form_type: 'CMS-1500',
    linked_claim_id: null,
    patient: { name: 'Test Patient', dob: '1990-01-01', sex: 'M', member_id: 'MBR-000' },
    insured_other: { has_other_insurance: false },
    box9_11d_other_insurance_marked: false,
    box21_diagnoses: ['Z00.00'],
    box23_prior_auth_number: null,
    box24_service_lines: [],
    box33_billing_provider: { name: 'Test Provider', npi: '1000000000' },
    total_charge: 30000,
    sla_tier: 'standard',
    urgency_target: 'mid',
    _testMeta: { scenario: 'fraud', scenario_label: 'test', note: 'test' },
    submitted_date: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    ...overrides,
  } as GeneratedClaim;
}

function fixtureResult(overrides: Partial<PipelineClaimResult> = {}): PipelineClaimResult {
  return {
    claim_id: 'TEST-01',
    category: 'fraud',
    category_detail: 'upcoding',
    evidence: ['critical care code billed for a stable patient'],
    disputed_medical_necessity: true,
    missing_fields: [],
    confidence_tier: 'High Confidence',
    recommendation_narrative: 'Strong evidence of upcoding.',
    recommended_action: 'Deny',
    severity: 'Critical',
    status: 'Submitted, flagged',
    sla: { windowHours: 720, activeElapsedHours: 2, percentRemaining: 0.99, isBreached: false },
    ...overrides,
  };
}

describe('getCurrentClaimState', () => {
  beforeEach(() => {
    clearAuditLog();
  });

  it('falls back to the Pipeline result when no human action has happened yet', () => {
    const state = getCurrentClaimState(fixtureClaim(), fixtureResult());
    expect(state.status).toBe('Submitted, flagged');
    expect(state.severity).toBe('Critical');
    expect(state.auditLog).toEqual([]);
  });

  it("reflects the latest audit entry's status, and resets severity to Low once Denied", () => {
    appendAuditEntry({
      claim_id: 'TEST-01',
      timestamp: '2026-07-28T12:00:00.000Z',
      actor: 'Adjuster',
      action: 'deny',
      from_status: 'Submitted, flagged',
      to_status: 'Denied',
      reason: 'Confirmed upcoding.',
    });

    const state = getCurrentClaimState(fixtureClaim(), fixtureResult());
    expect(state.status).toBe('Denied');
    expect(state.severity).toBe('Low');
    expect(state.auditLog).toHaveLength(1);
  });

  it('keeps live severity for Escalated rather than resetting it', () => {
    appendAuditEntry({
      claim_id: 'TEST-01',
      timestamp: '2026-07-28T12:00:00.000Z',
      actor: 'Adjuster',
      action: 'escalate',
      from_status: 'Submitted, flagged',
      to_status: 'Escalated',
    });

    const state = getCurrentClaimState(fixtureClaim(), fixtureResult());
    expect(state.status).toBe('Escalated');
    expect(state.severity).toBe('Critical');
  });

  it('uses only the claim actually queried — a different claim_id in storage does not leak in', () => {
    appendAuditEntry({
      claim_id: 'OTHER-CLAIM',
      timestamp: '2026-07-28T12:00:00.000Z',
      actor: 'Adjuster',
      action: 'deny',
      from_status: 'Submitted, flagged',
      to_status: 'Denied',
    });

    const state = getCurrentClaimState(fixtureClaim(), fixtureResult());
    expect(state.status).toBe('Submitted, flagged'); // untouched — falls back to Pipeline result
  });
});
