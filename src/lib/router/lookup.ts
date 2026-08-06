// Lookup tool dispatch — project-spec.txt Section 1's table, extended
// 2026-07-28 to accept a structured filter as well as a specific claim ID
// (the mechanism behind the ambiguous-query fallback). Pure deterministic
// code, no model call: the Router's job is deciding which claim ID or
// filter the adjuster means; this just reads the already-computed index.

import type { ClaimIndex, LookupFilter } from './types';
import type { Claim } from '../claims/types';
import { isRecommendationFulfilled } from '../rules/status';

function codesSummary(claim: Claim): string {
  if (claim.form_type === 'CMS-1500') {
    const procedures = claim.box24_service_lines.map((l) => l.box24d_procedure_code).join(', ');
    return `Diagnoses: ${claim.box21_diagnoses.join(', ')}. Procedures: ${procedures}.`;
  }
  const procedures = claim.box42_49_revenue_lines.map((l) => l.box44_hcpcs_code ?? l.box42_revenue_code).join(', ');
  return `Principal diagnosis: ${claim.box67_principal_diagnosis ?? '(missing)'}. Revenue/procedure codes: ${procedures}.`;
}

function providerName(claim: Claim): string {
  return claim.form_type === 'CMS-1500' ? (claim.box33_billing_provider.name ?? '(missing)') : claim.billing_provider_name;
}

export interface SingleClaimLookupResult {
  claim_id: string;
  patient: string;
  provider: string;
  codes: string;
  billed_amount: number;
  status: string;
  severity: string;
  confidence: string;
  recommended_action: string;
  /** Deterministic, not left for the model to infer — found live 2026-08-06
   *  that Anchor kept framing an already-fulfilled recommendation as an
   *  open ask even once it had the claim's real current status in hand. */
  recommendation_fulfilled: boolean;
  history_note: string;
}

export interface FilteredLookupResult {
  filter: LookupFilter;
  count: number;
  /** Computed over every match, not just the ones listed below. */
  total_billed_amount: number;
  by_category: Record<string, number>;
  by_status: Record<string, number>;
  by_severity: Record<string, number>;
  matches: {
    claim_id: string;
    patient: string;
    provider: string;
    status: string;
    severity: string;
    category: string;
    billed_amount: number;
    recommended_action: string;
    recommendation_fulfilled: boolean;
  }[];
}

export type LookupResult =
  | { mode: 'single'; data: SingleClaimLookupResult }
  | { mode: 'filtered'; data: FilteredLookupResult }
  | { mode: 'error'; message: string };

export function dispatchLookup(
  index: ClaimIndex,
  input: { claim_id?: string; filter?: LookupFilter },
): LookupResult {
  if (input.claim_id) {
    const entry = index.get(input.claim_id);
    if (!entry) {
      return { mode: 'error', message: `No claim found with ID "${input.claim_id}".` };
    }
    const { claim, result } = entry;
    return {
      mode: 'single',
      data: {
        // input.claim_id is the display number Claude gave us — already
        // confirmed valid by the index lookup above. claim.claim_id is the
        // real internal id and must never be echoed back into the
        // conversation (project-spec.txt Section 7d).
        claim_id: input.claim_id,
        patient: `${claim.patient.name} (DOB ${claim.patient.dob})`,
        provider: providerName(claim),
        codes: codesSummary(claim),
        billed_amount: claim.total_charge,
        status: result.status,
        severity: result.severity,
        confidence: result.confidence_tier ?? 'N/A (complex-math)',
        recommended_action: result.recommended_action,
        recommendation_fulfilled: isRecommendationFulfilled(result.recommended_action, result.status),
        history_note: `Submitted ${claim.submitted_date}; SLA window ${(result.sla.percentRemaining * 100).toFixed(0)}% remaining${result.sla.isBreached ? ' (BREACHED)' : ''}.`,
      },
    };
  }

  if (input.filter) {
    const {
      status, severity, category,
      patient_name, provider_name,
      min_amount, max_amount,
      max_sla_percent_remaining,
      recommended_action,
    } = input.filter;
    const statusSet = status === undefined ? undefined : Array.isArray(status) ? status : [status];
    const patientNeedle = patient_name?.toLowerCase();
    const providerNeedle = provider_name?.toLowerCase();
    const matches = [...index.entries()].filter(([, { claim, result }]) => {
      if (statusSet && !statusSet.includes(result.status)) return false;
      if (severity && result.severity !== severity) return false;
      if (category && result.category !== category) return false;
      if (patientNeedle && !claim.patient.name.toLowerCase().includes(patientNeedle)) return false;
      if (providerNeedle && !providerName(claim).toLowerCase().includes(providerNeedle)) return false;
      if (min_amount !== undefined && claim.total_charge < min_amount) return false;
      if (max_amount !== undefined && claim.total_charge > max_amount) return false;
      if (max_sla_percent_remaining !== undefined && result.sla.percentRemaining * 100 > max_sla_percent_remaining) return false;
      if (recommended_action && result.recommended_action !== recommended_action) return false;
      return true;
    });

    const by_category: Record<string, number> = {};
    const by_status: Record<string, number> = {};
    const by_severity: Record<string, number> = {};
    let total_billed_amount = 0;
    for (const [, { claim, result }] of matches) {
      by_category[result.category] = (by_category[result.category] ?? 0) + 1;
      by_status[result.status] = (by_status[result.status] ?? 0) + 1;
      by_severity[result.severity] = (by_severity[result.severity] ?? 0) + 1;
      total_billed_amount += claim.total_charge;
    }

    return {
      mode: 'filtered',
      data: {
        filter: input.filter,
        count: matches.length,
        total_billed_amount,
        by_category,
        by_status,
        by_severity,
        matches: matches.map(([displayId, { claim, result }]) => ({
          claim_id: displayId,
          patient: claim.patient.name,
          provider: providerName(claim),
          status: result.status,
          severity: result.severity,
          category: result.category,
          billed_amount: claim.total_charge,
          recommended_action: result.recommended_action,
          recommendation_fulfilled: isRecommendationFulfilled(result.recommended_action, result.status),
        })),
      },
    };
  }

  return { mode: 'error', message: 'Lookup requires either a claim_id or a filter.' };
}
