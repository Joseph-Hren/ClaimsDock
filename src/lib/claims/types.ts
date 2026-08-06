// Claim schema — field names mirror real CMS-1500 / UB-04 box numbers and labels
// (project-spec.txt Section 7d), not generic field names. Two form shapes because
// they're genuinely different documents: CMS-1500 for individual/non-institutional
// professional services, UB-04 (CMS-1450) for institutional facility billing.
//
// submitted_date is deliberately NOT part of the authored data below — it's the one
// field computed at generation time by generate-claims.ts (Section 11), seeded by
// the current ISO week. Every other field here is fixed, authored content.

export type FormType = 'CMS-1500' | 'UB-04';

// The five categories the Evaluation Pipeline's Call 1 (Analysis) assigns to a claim.
// Not stored as a real claim field at runtime (it's Pipeline OUTPUT, computed later) —
// present here only inside _testMeta, as the scenario this seed claim was authored to
// exercise, so the validator and later pipeline-accuracy tests have ground truth to
// check against.
export type ScenarioCategory =
  | 'clean'
  | 'ambiguous'
  | 'missing-data'
  | 'complex-math'
  | 'fraud';

export type SlaTier = 'standard' | 'urgent';

// How far into its SLA window this claim's generated submitted_date should land —
// see generate-claims.ts. Not a real claim field; an authoring instruction to the
// seed generator so the 20-claim set produces a realistic spread of urgency states
// (Section 11) rather than a uniformly random or uniformly stale one.
export type UrgencyTarget = 'fresh' | 'mid' | 'near_deadline' | 'breached';

export interface Patient {
  name: string;
  dob: string; // YYYY-MM-DD
  sex: 'M' | 'F' | 'NB';
  member_id: string;
}

export interface InsuredOther {
  has_other_insurance: boolean;
  other_insurer_name?: string;
  details_provided?: boolean; // false = "marked yes with no specifics" ambiguity case
}

export interface BillingProvider {
  name: string | null; // null = deliberately missing (Box 33 / Box 76 scenarios)
  npi: string | null;
  address?: string;
}

// CMS-1500 Box 24 service line
export interface CMS1500ServiceLine {
  line: number;
  box24a_date_of_service: string; // YYYY-MM-DD
  box24b_place_of_service: string; // POS code, e.g. "11" office, "21" inpatient hospital
  box24d_procedure_code: string; // CPT/HCPCS
  box24d_modifiers?: string[];
  box24e_diagnosis_pointer: string; // e.g. "A" or "A,B"
  box24f_charge: number;
  box24g_units: number;
  box24j_rendering_provider_npi: string | null; // null = deliberately missing
}

export interface CMS1500Claim {
  claim_id: string;
  form_type: 'CMS-1500';
  linked_claim_id: string | null;
  patient: Patient;
  insured_other: InsuredOther;
  box9_11d_other_insurance_marked: boolean;
  box21_diagnoses: string[]; // ICD-10, ordered A, B, C...
  box23_prior_auth_number: string | null;
  box24_service_lines: CMS1500ServiceLine[];
  box33_billing_provider: BillingProvider;
  // Box 19 is a real free-text field on the CMS-1500 ("Additional Claim
  // Information") — the one place genuine unstructured clinical shorthand
  // legitimately lives on this form. Present only where it's actually
  // relevant to the scenario; the Pipeline's Analysis call (Phase 5) is
  // meant to read and reason over this, not just the coded fields.
  box19_additional_claim_information?: string;
  total_charge: number;
  sla_tier: SlaTier;
  urgency_target: UrgencyTarget;
  _testMeta: {
    scenario: ScenarioCategory;
    scenario_label: string; // e.g. "fraud-phantom-billing"
    note: string; // what this claim was built to demonstrate
    deliberately_missing_field?: string; // e.g. "box33_billing_provider.name"
  };
}

// UB-04 Box 42-49 revenue-code line
export interface UB04RevenueLine {
  line: number;
  box42_revenue_code: string;
  box44_hcpcs_code?: string;
  box45_service_date: string; // YYYY-MM-DD
  box46_service_units: number;
  box47_total_charge: number;
}

export interface UB04ValueCode {
  code: string; // e.g. "23" (recurring monthly income) — using 39-41 deductible/coinsurance codes here
  amount: number;
}

export interface UB04Claim {
  claim_id: string;
  form_type: 'UB-04';
  linked_claim_id: string | null;
  patient: Patient;
  insured_other: InsuredOther;
  box4_type_of_bill: string;
  box6_statement_covers_period: { from: string; through: string };
  box18_28_condition_codes: string[];
  box31_34_occurrence_codes: { code: string; date: string }[];
  box39_41_value_codes: UB04ValueCode[];
  box42_49_revenue_lines: UB04RevenueLine[];
  box67_principal_diagnosis: string | null; // null = deliberately missing
  box76_attending_provider_npi: string | null; // null = deliberately missing
  // Box 80 is UB-04's real free-text "Remarks" field — the institutional-claim
  // counterpart to CMS-1500's Box 19. Same purpose: genuine unstructured
  // content for the Pipeline to read, present only where relevant.
  box80_remarks?: string;
  billing_provider_name: string;
  billing_provider_npi: string;
  total_charge: number;
  sla_tier: SlaTier;
  urgency_target: UrgencyTarget;
  _testMeta: {
    scenario: ScenarioCategory;
    scenario_label: string;
    note: string;
    deliberately_missing_field?: string;
  };
}

export type Claim = CMS1500Claim | UB04Claim;

// Attached at generation time by generate-claims.ts — the one derived field.
export type GeneratedClaim = Claim & { submitted_date: string };

export interface ProviderHistoryEntry {
  provider_npi: string;
  provider_name: string;
  trailing_6mo_avg_monthly_claims: number;
  current_month_claims: number;
  note: string;
}

// Neither of these lives on a real claim form — network status comes from
// cross-referencing the billing provider's NPI against the payer's network
// directory, and remaining deductible comes from the member's own benefit
// accumulator. Both are separate systems in real claims processing, not
// fields to extract from the claim itself — modeled here the same way.
export interface NetworkDirectoryEntry {
  provider_npi: string;
  provider_name: string;
  network_status: 'in-network' | 'out-of-network';
}

export interface MemberAccumulatorEntry {
  member_id: string;
  plan_year: number;
  deductible_individual_limit: number;
  deductible_remaining: number; // as of the reference point below
  inpatient_days_used_this_plan_year: number; // toward CAPS.inpatientBenefitDaysPerPlanYear
  as_of: string; // YYYY-MM-DD — accumulators are a snapshot, not live data
}
