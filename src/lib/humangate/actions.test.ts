import { describe, it, expect } from 'vitest';
import { submitHumanAction, submitPostTerminalAction } from './actions';
import type { GeneratedClaim } from '../claims/types';
import type { PipelineClaimResult } from '../pipeline/orchestrator';
import type { AuditLogEntry } from './types';

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
    total_charge: 30000, // deliberately high — proves the severity reset isn't dollar-dependent
    sla_tier: 'standard',
    urgency_target: 'mid',
    _testMeta: { scenario: 'fraud', scenario_label: 'test', note: 'test' },
    submitted_date: new Date(Date.now() - 2 * 3_600_000).toISOString(), // 2 hours ago — >=50% of a 30-day window remains
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

describe('submitHumanAction', () => {
  it('resets severity to Low on approve, even for a high-dollar disputed-necessity claim', () => {
    const result = submitHumanAction(fixtureClaim(), fixtureResult(), { claimId: 'TEST-01', action: 'approve' });
    expect(result.status).toBe('Resolved');
    expect(result.severity).toBe('Low');
  });

  it('resets severity to Low on deny, same as approve', () => {
    const result = submitHumanAction(fixtureClaim(), fixtureResult(), {
      claimId: 'TEST-01',
      action: 'deny',
      denialJustification: {
        specificReason: 'Documentation contradicts the billed acuity level.',
        planPolicyProvision: 'Coverage Policy §3.2 — acuity-level documentation requirement.',
        internalRuleOrStandard: 'None.',
        reversalCriteria: 'Corrected documentation matching the billed acuity level.',
      },
    });
    expect(result.status).toBe('Denied');
    expect(result.severity).toBe('Low');
  });

  it('keeps live severity on escalate — does not reset to Low', () => {
    const result = submitHumanAction(fixtureClaim(), fixtureResult(), { claimId: 'TEST-01', action: 'escalate' });
    expect(result.status).toBe('Escalated');
    // $30,000 + disputed necessity + fresh claim (>=50% SLA remaining) -> Critical, per severity.ts.
    expect(result.severity).toBe('Critical');
  });

  it('keeps live severity on request_additional_info — does not reset to Low', () => {
    const result = submitHumanAction(fixtureClaim(), fixtureResult({ category: 'missing-data', recommended_action: 'Request Additional Info' }), {
      claimId: 'TEST-01',
      action: 'request_additional_info',
      note: 'Missing itemized billing statement for the inpatient stay.',
    });
    expect(result.status).toBe('Additional Info Requested');
    expect(result.severity).toBe('Critical');
  });

  it('throws for request_additional_info with a blank note', () => {
    expect(() =>
      submitHumanAction(fixtureClaim(), fixtureResult({ category: 'missing-data', recommended_action: 'Request Additional Info' }), {
        claimId: 'TEST-01',
        action: 'request_additional_info',
      }),
    ).toThrow('a note is required for Request Additional Info');
  });

  it('builds a complete audit entry for deny, with denialDetail instead of reason', () => {
    const now = new Date('2026-07-28T12:00:00Z');
    const denialJustification = {
      specificReason: 'Upcoding confirmed against documentation.',
      planPolicyProvision: 'Coverage Policy §3.2.',
      internalRuleOrStandard: 'None.',
      reversalCriteria: 'None.',
    };
    const result = submitHumanAction(
      fixtureClaim(),
      fixtureResult(),
      { claimId: 'TEST-01', action: 'deny', denialJustification },
      now,
    );
    expect(result.auditEntry).toEqual({
      claim_id: 'TEST-01',
      timestamp: now.toISOString(),
      actor: 'Adjuster',
      action: 'deny',
      from_status: 'Submitted, flagged',
      to_status: 'Denied',
      reason: undefined,
      denialDetail: denialJustification,
    });
  });

  it('builds a complete audit entry for escalate, carrying the free-text note in reason', () => {
    const now = new Date('2026-07-28T12:00:00Z');
    const result = submitHumanAction(
      fixtureClaim(),
      fixtureResult({ recommended_action: 'Escalate' }),
      { claimId: 'TEST-01', action: 'escalate', note: 'Suspected fraud ring — flagging for the SIU team.' },
      now,
    );
    expect(result.auditEntry).toEqual({
      claim_id: 'TEST-01',
      timestamp: now.toISOString(),
      actor: 'Adjuster',
      action: 'escalate',
      from_status: 'Submitted, flagged',
      to_status: 'Escalated',
      reason: 'Suspected fraud ring — flagging for the SIU team.',
      denialDetail: undefined,
    });
  });
});

describe('submitPostTerminalAction', () => {
  function entry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
    return {
      claim_id: 'TEST-01',
      timestamp: '2026-07-20T12:00:00Z',
      actor: 'Adjuster',
      action: 'escalate',
      from_status: 'Submitted, flagged',
      to_status: 'Escalated',
      ...overrides,
    };
  }

  it('undo_deny returns the claim to whatever from_status was on the deny entry', () => {
    const auditLog = [entry({ action: 'deny', from_status: 'Needs Approval', to_status: 'Denied' })];
    const result = submitPostTerminalAction(fixtureClaim(), fixtureResult(), auditLog, {
      claimId: 'TEST-01',
      action: 'undo_deny',
      note: 'Provider supplied corrected documentation after the fact.',
    });
    expect(result.status).toBe('Needs Approval');
  });

  it('undo_escalate returns to the pre-escalation status, recomputing severity live (not reset to Low)', () => {
    const auditLog = [entry({ action: 'escalate', from_status: 'Submitted, flagged', to_status: 'Escalated' })];
    const result = submitPostTerminalAction(fixtureClaim(), fixtureResult(), auditLog, {
      claimId: 'TEST-01',
      action: 'undo_escalate',
      note: 'Escalated in error — this does not need SIU review.',
    });
    expect(result.status).toBe('Submitted, flagged');
    expect(result.severity).toBe('Critical'); // live computation, same as escalate itself
  });

  it('request_recoupment moves a Resolved claim to Recoupment Requested with High severity', () => {
    const auditLog = [entry({ action: 'approve', from_status: 'Submitted, no flags', to_status: 'Resolved' })];
    const result = submitPostTerminalAction(
      fixtureClaim(),
      fixtureResult({ recommended_action: 'Approve' }),
      auditLog,
      { claimId: 'TEST-01', action: 'request_recoupment', note: 'Duplicate payment discovered during a billing audit.' },
    );
    expect(result.status).toBe('Recoupment Requested');
    expect(result.severity).toBe('High');
  });

  it('undo_recoupment returns a Recoupment Requested claim to Resolved, with an optional note', () => {
    const auditLog = [
      entry({ action: 'approve', from_status: 'Submitted, no flags', to_status: 'Resolved' }),
      entry({ action: 'request_recoupment', from_status: 'Resolved', to_status: 'Recoupment Requested' }),
    ];
    const result = submitPostTerminalAction(fixtureClaim(), fixtureResult({ recommended_action: 'Approve' }), auditLog, {
      claimId: 'TEST-01',
      action: 'undo_recoupment',
    });
    expect(result.status).toBe('Resolved');
    expect(result.severity).toBe('Low');
  });

  it('does not throw for undo_recoupment with a blank note — the one post-terminal action whose note is optional', () => {
    const auditLog = [entry({ action: 'request_recoupment', from_status: 'Resolved', to_status: 'Recoupment Requested' })];
    expect(() =>
      submitPostTerminalAction(fixtureClaim(), fixtureResult(), auditLog, {
        claimId: 'TEST-01',
        action: 'undo_recoupment',
      }),
    ).not.toThrow();
  });

  it('throws when the note is blank', () => {
    const auditLog = [entry({ action: 'deny', from_status: 'Needs Approval', to_status: 'Denied' })];
    expect(() =>
      submitPostTerminalAction(fixtureClaim(), fixtureResult(), auditLog, {
        claimId: 'TEST-01',
        action: 'undo_deny',
        note: '   ',
      }),
    ).toThrow('a note is required');
  });

  it('throws when there is no matching entry in the audit log to reverse', () => {
    const auditLog = [entry({ action: 'escalate', from_status: 'Submitted, flagged', to_status: 'Escalated' })];
    expect(() =>
      submitPostTerminalAction(fixtureClaim(), fixtureResult(), auditLog, {
        claimId: 'TEST-01',
        action: 'undo_deny',
        note: 'Reversing a denial that was never actually made.',
      }),
    ).toThrow('no "deny" entry found');
  });
});
