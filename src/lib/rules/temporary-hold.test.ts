import { describe, it, expect } from 'vitest';
import { temporaryHeldSince } from './temporary-hold';
import type { Claim } from '../claims/types';

function fixtureClaim(overrides: Partial<Claim['_testMeta']>): Claim {
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
    _testMeta: { scenario: 'clean', scenario_label: 'test', note: 'test', ...overrides },
  };
}

describe('temporaryHeldSince', () => {
  const submitted = new Date('2026-07-01T00:00:00Z');

  it('treats a missing-data claim with a flagged field as held since submission', () => {
    const claim = fixtureClaim({ scenario: 'missing-data', deliberately_missing_field: 'box24_service_lines[0].box24j_rendering_provider_npi' });
    expect(temporaryHeldSince(claim, submitted)).toEqual(submitted);
  });

  it('does not hold a missing-data claim with no flagged field', () => {
    const claim = fixtureClaim({ scenario: 'missing-data' });
    expect(temporaryHeldSince(claim, submitted)).toBeNull();
  });

  it('does not hold non-missing-data claims', () => {
    const claim = fixtureClaim({ scenario: 'clean' });
    expect(temporaryHeldSince(claim, submitted)).toBeNull();
  });
});
