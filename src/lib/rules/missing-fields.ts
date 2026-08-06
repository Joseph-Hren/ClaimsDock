// Deterministic missing-required-field detection — project-spec.txt Section
// 7c. Whether a required field is actually null is a hard fact, not a
// judgment call, so it's checked in code rather than left to the Pipeline's
// Analysis call to notice on its own. Serves as a safety net for Phase 5's
// orchestrator: if this detects a material gap the model's category call
// didn't land on, the deterministic finding wins (see orchestrator.ts).

import type { Claim } from '../claims/types';

export interface MissingFieldFinding {
  field: string;
  material: boolean;
}

// Materiality per known nullable field (Section 7c: material = coverage/
// network/provider verification genuinely can't proceed without it). Every
// nullable field in today's schema happens to be material — the table is
// still per-field, explicit, rather than a blanket "any null field is
// material" assumption, so a future non-material nullable field only needs
// an entry here, not new branching logic.
const MATERIALITY: Record<string, boolean> = {
  'box24_service_lines[].box24j_rendering_provider_npi': true,
  'box33_billing_provider.name': true,
  'box33_billing_provider.npi': true,
  box67_principal_diagnosis: true,
  box76_attending_provider_npi: true,
};

export function detectMissingFields(claim: Claim): MissingFieldFinding[] {
  const findings: MissingFieldFinding[] = [];

  if (claim.form_type === 'CMS-1500') {
    if (claim.box33_billing_provider.name === null) {
      findings.push({ field: 'box33_billing_provider.name', material: MATERIALITY['box33_billing_provider.name'] });
    }
    if (claim.box33_billing_provider.npi === null) {
      findings.push({ field: 'box33_billing_provider.npi', material: MATERIALITY['box33_billing_provider.npi'] });
    }
    claim.box24_service_lines.forEach((line, i) => {
      if (line.box24j_rendering_provider_npi === null) {
        findings.push({
          field: `box24_service_lines[${i}].box24j_rendering_provider_npi`,
          material: MATERIALITY['box24_service_lines[].box24j_rendering_provider_npi'],
        });
      }
    });
  } else {
    if (claim.box67_principal_diagnosis === null) {
      findings.push({ field: 'box67_principal_diagnosis', material: MATERIALITY.box67_principal_diagnosis });
    }
    if (claim.box76_attending_provider_npi === null) {
      findings.push({ field: 'box76_attending_provider_npi', material: MATERIALITY.box76_attending_provider_npi });
    }
  }

  return findings;
}

export function hasMaterialMissingField(claim: Claim): boolean {
  return detectMissingFields(claim).some((f) => f.material);
}
