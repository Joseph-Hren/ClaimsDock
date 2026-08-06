// Single source of truth for ClaimsDock's synthetic coverage policy.
//
// content/corpora/coverage-policy.md (the RAG-facing, citable prose document)
// is GENERATED from these constants by scripts/generate-coverage-policy.ts —
// it is not hand-maintained separately. Change a number here, regenerate the
// doc, and Anchor's citations and the actual coverage-math calculation can
// never silently disagree with each other.

export interface CoverageCategory {
  key: string;
  label: string;
  coverage: number; // fraction, e.g. 0.8 = 80%
  note?: string;
}

export const DEDUCTIBLE = {
  individualAnnualLimit: 500,
  familyAnnualLimit: 1500,
};

export const COVERAGE_CATEGORIES: CoverageCategory[] = [
  { key: 'preventive', label: 'Preventive care (screenings, annual wellness visit)', coverage: 1.0, note: 'deductible waived' },
  { key: 'primary_specialist_visit', label: 'Primary care / specialist office visits', coverage: 0.9 },
  { key: 'outpatient_procedure', label: 'Outpatient procedures and same-day surgery', coverage: 0.8 },
  { key: 'inpatient_facility', label: 'Inpatient facility stays', coverage: 0.8 },
  { key: 'emergency_department', label: 'Emergency department visits', coverage: 0.8, note: 'deductible applies, but network status does not' },
  { key: 'physical_occupational_therapy', label: 'Physical / occupational therapy', coverage: 0.8, note: `up to ${30} visits per plan year` },
  { key: 'dme', label: 'Durable medical equipment (DME)', coverage: 0.7 },
  { key: 'mental_health', label: 'Mental health and substance use services', coverage: 0.9, note: 'parity with primary care, per plan design' },
];

export const NETWORK = {
  outOfNetworkCoverage: 0.6, // flat rate, not a discount off the category's in-network rate
  emergencyExemptFromNetworkPenalty: true, // ER is covered at in-network rate regardless of facility network status
};

export const CAPS = {
  therapyVisitsPerPlanYear: 30,
  inpatientBenefitDaysPerPlanYear: 60,
  // The generated policy doc below has always said days beyond the cap are
  // "covered at a reduced per-diem rate rather than a hard cutoff" — but no
  // actual rate backed that claim anywhere in the codebase until now (found
  // while building the day-cap calculator, Phase 11 Pass A1).
  inpatientPostCapCoverage: 0.5,
};

export const PRIOR_AUTH_TYPICALLY_REQUIRED = [
  'Inpatient elective admissions',
  'Advanced imaging (MRI, CT, PET)',
  'Durable medical equipment over $500',
  'Major-joint injections and certain injectable/infusion therapies (plan-dependent — a genuine coverage-applicability ambiguity, not always resolvable from the claim alone)',
];

export const PRIOR_AUTH_NOT_REQUIRED = [
  'Routine primary care and specialist office visits',
  'Emergency department visits (by definition — emergencies cannot be pre-authorized)',
  'Preventive screenings',
  'Physical/occupational therapy within the standard visit allowance',
];

// Found missing live, 2026-08-06 — a real gap, not an oversight caught in
// review: the Deny justification guardrail correctly, repeatedly rejected
// field 2 (plan/policy provision cited) on real fraud-category denials,
// because there was genuinely nothing in this policy for a citation to
// point to — no provision anywhere stated that a fraudulently billed claim
// is non-payable at all. Standard boilerplate in any real insurance policy
// (a "fraud and misrepresentation" exclusion is one of the most common
// clauses there is); its total absence here meant field 2 could never be
// satisfied for a fraud denial no matter how well-drafted, which is a
// corpus gap, not a prompt-tuning problem.
export const FRAUD_NONPAYMENT_PROVISION =
  'Benefits are not payable for any claim or portion of a claim involving fraud, intentional misrepresentation, or abusive billing practices — including, but not limited to, phantom billing, upcoding, unbundling, double billing, and billing for medically unnecessary or substandard care (see the Fraud-Indicator Reference for the recognized typology). This applies regardless of whether the claim would otherwise satisfy standard coverage criteria, network status, or prior-authorization requirements described elsewhere in this policy — a claim exhibiting one or more of these patterns is non-payable on that basis alone.';

export function coverageForCategory(categoryKey: string, isInNetwork: boolean, isEmergency = false): number {
  const category = COVERAGE_CATEGORIES.find((c) => c.key === categoryKey);
  if (!category) throw new Error(`Unknown coverage category: ${categoryKey}`);
  if (!isInNetwork && !(isEmergency && NETWORK.emergencyExemptFromNetworkPenalty)) {
    return NETWORK.outOfNetworkCoverage;
  }
  return category.coverage;
}
