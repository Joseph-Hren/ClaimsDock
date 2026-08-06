import { describe, it, expect } from 'vitest';
import { temporaryHeldSince } from './temporary-hold';
import type { Claim } from '../claims/types';

function fixtureClaim(overrides: Partial<Claim>): Claim {
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
    total_charge: 100,
    sla_tier: 'standard',
    urgency_target: 'mid',
    _testMeta: { scenario: 'clean', scenario_label: 'test', note: 'test' },
    ...overrides,
  } as Claim;
}

describe('temporaryHeldSince', () => {
  const submitted = new Date('2026-07-01T00:00:00Z');

  it('holds a claim with an actual material field missing (billing provider NPI null)', () => {
    const claim = fixtureClaim({ box33_billing_provider: { name: 'Test Provider', npi: null } });
    expect(temporaryHeldSince(claim, submitted)).toEqual(submitted);
  });

  it('does not hold a claim with no missing fields', () => {
    const claim = fixtureClaim({});
    expect(temporaryHeldSince(claim, submitted)).toBeNull();
  });

  it('does not hold on a legitimately-optional null field (prior auth not required)', () => {
    const claim = fixtureClaim({ box23_prior_auth_number: null });
    expect(temporaryHeldSince(claim, submitted)).toBeNull();
  });
});
