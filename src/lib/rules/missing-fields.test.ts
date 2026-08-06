import { describe, it, expect } from 'vitest';
import { detectMissingFields, hasMaterialMissingField } from './missing-fields';
import claimsData from '../claims/claims-seed-data.json';
import type { Claim } from '../claims/types';

const claims = (claimsData as { claims: Claim[] }).claims;
const byId = (id: string) => claims.find((c) => c.claim_id === id)!;

describe('detectMissingFields', () => {
  it('finds a null rendering-provider NPI on a CMS-1500 service line', () => {
    const findings = detectMissingFields(byId('MIS-CMS-01'));
    expect(findings).toEqual([
      { field: 'box24_service_lines[0].box24j_rendering_provider_npi', material: true },
    ]);
  });

  it('finds a null attending-provider NPI on a UB-04', () => {
    const findings = detectMissingFields(byId('MIS-CMB-01B'));
    expect(findings).toEqual([{ field: 'box76_attending_provider_npi', material: true }]);
  });

  it('finds nothing on a claim with no missing required fields', () => {
    expect(detectMissingFields(byId('CLN-CMS-01'))).toEqual([]);
    expect(detectMissingFields(byId('MIS-CMB-01A'))).toEqual([]);
  });

  it('does not flag box23_prior_auth_number — legitimately null when not required, not a gap', () => {
    const clean = byId('CLN-CMS-01');
    expect((clean as Extract<Claim, { form_type: 'CMS-1500' }>).box23_prior_auth_number).toBeNull();
    expect(detectMissingFields(clean)).toEqual([]);
  });
});

describe('hasMaterialMissingField', () => {
  it('is true for claims with a material gap', () => {
    expect(hasMaterialMissingField(byId('MIS-CMS-01'))).toBe(true);
    expect(hasMaterialMissingField(byId('MIS-CMB-01B'))).toBe(true);
  });

  it('is false for claims with no gap', () => {
    expect(hasMaterialMissingField(byId('CLN-CMS-01'))).toBe(false);
  });
});
