// Structural validator for claims-seed-data.json — checks the SHAPE is well-formed
// (required fields present, linked pairs resolve, enums valid, totals add up).
// It deliberately does NOT enforce clinical completeness — some claims are
// authored to be incomplete on purpose (the missing-data scenario), and a field
// listed in that claim's _testMeta.deliberately_missing_field is expected to be
// null, not a validation failure.

import { generateClaims, getProviderHistory } from '../src/lib/claims/generate-claims';
import type { CMS1500Claim, UB04Claim, Claim } from '../src/lib/claims/types';

const VALID_SCENARIOS = ['clean', 'ambiguous', 'missing-data', 'complex-math', 'fraud'];
const VALID_SLA_TIERS = ['standard', 'urgent'];
const VALID_URGENCY = ['fresh', 'mid', 'near_deadline', 'breached'];

let errors: string[] = [];
let warnings: string[] = [];

function isWhitelisted(claim: Claim, fieldPath: string): boolean {
  return claim._testMeta.deliberately_missing_field === fieldPath;
}

function checkRequired(claim: Claim, fieldPath: string, value: unknown) {
  if ((value === null || value === undefined) && !isWhitelisted(claim, fieldPath)) {
    errors.push(`${claim.claim_id}: ${fieldPath} is missing but not listed in _testMeta.deliberately_missing_field`);
  }
}

function validateCMS1500(c: CMS1500Claim) {
  checkRequired(c, 'box33_billing_provider.name', c.box33_billing_provider.name);
  checkRequired(c, 'box33_billing_provider.npi', c.box33_billing_provider.npi);
  c.box24_service_lines.forEach((line, i) => {
    checkRequired(c, `box24_service_lines[${i}].box24j_rendering_provider_npi`, line.box24j_rendering_provider_npi);
  });
  const sumLines = c.box24_service_lines.reduce((s, l) => s + l.box24f_charge * l.box24g_units, 0);
  if (Math.abs(sumLines - c.total_charge) > 0.01) {
    errors.push(`${c.claim_id}: total_charge (${c.total_charge}) doesn't match sum of service lines (${sumLines})`);
  }
  if (c.box21_diagnoses.length === 0) errors.push(`${c.claim_id}: box21_diagnoses is empty`);
  if (c.box24_service_lines.length === 0) errors.push(`${c.claim_id}: box24_service_lines is empty`);
}

function validateUB04(c: UB04Claim) {
  checkRequired(c, 'box67_principal_diagnosis', c.box67_principal_diagnosis);
  checkRequired(c, 'box76_attending_provider_npi', c.box76_attending_provider_npi);
  const sumLines = c.box42_49_revenue_lines.reduce((s, l) => s + l.box47_total_charge, 0);
  if (Math.abs(sumLines - c.total_charge) > 0.01) {
    errors.push(`${c.claim_id}: total_charge (${c.total_charge}) doesn't match sum of revenue lines (${sumLines})`);
  }
  if (c.box42_49_revenue_lines.length === 0) errors.push(`${c.claim_id}: box42_49_revenue_lines is empty`);
}

function main() {
  const claims = generateClaims();
  const idSet = new Set<string>();

  claims.forEach((c) => {
    if (idSet.has(c.claim_id)) errors.push(`Duplicate claim_id: ${c.claim_id}`);
    idSet.add(c.claim_id);

    if (!VALID_SCENARIOS.includes(c._testMeta.scenario)) errors.push(`${c.claim_id}: invalid scenario "${c._testMeta.scenario}"`);
    if (!VALID_SLA_TIERS.includes(c.sla_tier)) errors.push(`${c.claim_id}: invalid sla_tier "${c.sla_tier}"`);
    if (!VALID_URGENCY.includes(c.urgency_target)) errors.push(`${c.claim_id}: invalid urgency_target "${c.urgency_target}"`);
    if (Number.isNaN(Date.parse(c.submitted_date))) errors.push(`${c.claim_id}: submitted_date "${c.submitted_date}" is not a valid date`);

    if (c.form_type === 'CMS-1500') validateCMS1500(c);
    else if (c.form_type === 'UB-04') validateUB04(c);
    else errors.push(`${(c as Claim).claim_id}: invalid form_type "${(c as Claim).form_type}"`);
  });

  // Linked pairs must reference each other both ways.
  const byId = new Map(claims.map((c) => [c.claim_id, c]));
  claims.forEach((c) => {
    if (c.linked_claim_id) {
      const partner = byId.get(c.linked_claim_id);
      if (!partner) errors.push(`${c.claim_id}: linked_claim_id "${c.linked_claim_id}" does not exist`);
      else if (partner.linked_claim_id !== c.claim_id) errors.push(`${c.claim_id} <-> ${c.linked_claim_id}: link is not reciprocal`);
    }
  });

  // Scenario distribution should match project-spec.txt Section 10 exactly.
  const scenarioCounts: Record<string, number> = {};
  claims.forEach((c) => { scenarioCounts[c._testMeta.scenario] = (scenarioCounts[c._testMeta.scenario] || 0) + 1; });
  const expected: Record<string, number> = { clean: 4, ambiguous: 3, 'missing-data': 3, 'complex-math': 3, fraud: 7 };
  Object.entries(expected).forEach(([scenario, count]) => {
    if (scenarioCounts[scenario] !== count) {
      errors.push(`Scenario "${scenario}" has ${scenarioCounts[scenario] || 0} records, expected ${count}`);
    }
  });
  if (claims.length !== 20) errors.push(`Expected 20 total claims, found ${claims.length}`);

  // Volume-spike provider referenced in provider-history.json should actually
  // appear on at least 2 claims in the seed set (the pattern being demonstrated).
  const providers = getProviderHistory();
  const spikeProvider = providers.find((p) => p.current_month_claims > p.trailing_6mo_avg_monthly_claims * 2);
  if (!spikeProvider) {
    warnings.push('No provider in provider-history.json shows a >2x volume spike — the volume-spike scenario has no ground truth to detect.');
  } else {
    const claimsFromSpikeProvider = claims.filter((c) =>
      c.form_type === 'CMS-1500' && c.box33_billing_provider.npi === spikeProvider.provider_npi
    );
    if (claimsFromSpikeProvider.length < 2) {
      errors.push(`Volume-spike provider ${spikeProvider.provider_name} only appears on ${claimsFromSpikeProvider.length} seed claim(s), expected 2-3`);
    }
  }

  console.log(`Checked ${claims.length} claims.`);
  console.log(`Scenario distribution:`, scenarioCounts);
  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  }
  if (errors.length) {
    console.log(`\n${errors.length} error(s):`);
    errors.forEach((e) => console.log(`  ✗ ${e}`));
    process.exit(1);
  }
  console.log('\n✓ All checks passed.');
}

main();
