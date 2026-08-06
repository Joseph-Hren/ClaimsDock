// Wires computeCoverage() (Phase 3) to a real claim — project-spec.txt
// Section 6. Neither network status nor deductible remaining live on the
// claim form itself (Section 7d's schema comment already established this);
// they come from the payer's network directory and the member's benefit
// accumulator, looked up here. First real caller of coverage.ts,
// network-directory.json, and member-accumulators.json, all built in Phase
// 3 and unused until this Human Gate wiring (Phase 7).
//
// CPT/HCPCS -> benefit-category mapping is a static crosswalk in real
// payer systems, not a judgment call — so it's a plain lookup table here
// too, scoped to the closed set of codes this project's 20 seed claims
// actually use (see scripts/*, not exhaustive CPT coverage).

import type { Claim } from '../claims/types';
import { computeCoverage, type CoverageResult, type LineChargeInput } from './coverage';
import { CAPS } from './coverage-constants';
import networkDirectoryData from '../claims/network-directory.json';
import memberAccumulatorsData from '../claims/member-accumulators.json';
import type { NetworkDirectoryEntry, MemberAccumulatorEntry } from '../claims/types';

const networkDirectory = (networkDirectoryData as { providers: NetworkDirectoryEntry[] }).providers;
const memberAccumulators = (memberAccumulatorsData as { members: MemberAccumulatorEntry[] }).members;

// CMS-1500 box24d_procedure_code -> coverage-constants.ts category key.
const CPT_CATEGORY_MAP: Record<string, string> = {
  '10060': 'outpatient_procedure', // incision & drainage
  '10061': 'outpatient_procedure', // incision & drainage, complicated
  '11100': 'outpatient_procedure', // skin biopsy
  '11401': 'outpatient_procedure', // excision, benign lesion
  '11402': 'outpatient_procedure', // excision, benign lesion
  '11403': 'outpatient_procedure', // excision, benign lesion, larger
  '12001': 'outpatient_procedure', // simple wound repair
  '17000': 'outpatient_procedure', // lesion destruction
  '12002': 'outpatient_procedure', // simple wound repair
  '20605': 'outpatient_procedure', // intermediate joint injection
  '20610': 'outpatient_procedure', // major joint arthrocentesis/injection
  '20611': 'outpatient_procedure', // joint injection with imaging guidance
  '27447': 'outpatient_procedure', // total knee arthroplasty
  '29881': 'outpatient_procedure', // knee arthroscopy
  '31231': 'outpatient_procedure', // diagnostic nasal endoscopy
  '36415': 'primary_specialist_visit', // venipuncture, bundled with an office visit
  '42820': 'outpatient_procedure', // tonsillectomy
  '44970': 'outpatient_procedure', // laparoscopic appendectomy
  '45385': 'outpatient_procedure', // colonoscopy with polypectomy
  '46260': 'outpatient_procedure', // hemorrhoidectomy
  '47562': 'outpatient_procedure', // laparoscopic cholecystectomy
  '49505': 'outpatient_procedure', // inguinal hernia repair
  '64483': 'outpatient_procedure', // epidural injection
  '60100': 'outpatient_procedure', // thyroid biopsy
  '64721': 'outpatient_procedure', // carpal tunnel release
  '66984': 'outpatient_procedure', // cataract extraction w/ IOL
  '71046': 'primary_specialist_visit', // chest X-ray, bundled with an office visit
  '80053': 'primary_specialist_visit', // comprehensive metabolic panel, bundled with an office visit
  '80061': 'primary_specialist_visit', // lipid panel, bundled with an office visit
  '81003': 'primary_specialist_visit', // urinalysis, bundled with an office visit
  '83036': 'primary_specialist_visit', // HbA1c, bundled with an office visit
  '84443': 'primary_specialist_visit', // TSH, bundled with an office visit
  '90834': 'mental_health', // individual psychotherapy
  '92014': 'primary_specialist_visit', // ophthalmological exam
  '93000': 'primary_specialist_visit', // EKG, bundled with an office visit
  '93458': 'outpatient_procedure', // diagnostic cardiac catheterization
  '93005': 'primary_specialist_visit', // EKG tracing only, bundled with an office visit
  '94010': 'primary_specialist_visit', // spirometry, bundled with an office visit
  '96365': 'outpatient_procedure', // IV infusion administration
  '96372': 'outpatient_procedure', // therapeutic injection
  '96375': 'outpatient_procedure', // additional sequential injection
  '97035': 'physical_occupational_therapy',
  '97110': 'physical_occupational_therapy',
  '97112': 'physical_occupational_therapy',
  '97140': 'physical_occupational_therapy',
  '99213': 'primary_specialist_visit', // office E/M
  '99214': 'primary_specialist_visit', // office E/M
  '99215': 'primary_specialist_visit', // office E/M, higher level
  '99221': 'inpatient_facility', // initial hospital care
  '99222': 'inpatient_facility', // initial hospital care
  '99223': 'inpatient_facility', // initial hospital care, higher level
  '99231': 'inpatient_facility', // subsequent hospital care
  '99232': 'inpatient_facility', // subsequent hospital care
  '99395': 'preventive', // periodic preventive exam
  '99396': 'preventive', // periodic preventive exam
};

// UB-04 box42_revenue_code -> coverage-constants.ts category key.
const REVENUE_CATEGORY_MAP: Record<string, string> = {
  '0120': 'inpatient_facility', // room & board
  '0206': 'inpatient_facility', // intensive care
  '0250': 'outpatient_procedure', // pharmacy, same-day-surgery context in this data set
  '0270': 'outpatient_procedure', // med/surg supplies
  '0300': 'emergency_department', // laboratory, tied to an ER visit in this data set
  '0360': 'outpatient_procedure', // OR services
  '0481': 'outpatient_procedure', // cardiac catheterization lab, same-day ASC context in this data set
  '0410': 'inpatient_facility', // respiratory services, part of an inpatient stay in this data set
  '0450': 'emergency_department',
  '0610': 'outpatient_procedure', // diagnostic imaging (MRI), same-day-service context in this data set
  '0710': 'inpatient_facility', // recovery room, tied to an inpatient admission in this data set
  '0730': 'inpatient_facility', // EKG, tied to an inpatient stay in this data set
  '0750': 'outpatient_procedure', // GI/endoscopy services
  '0762': 'outpatient_procedure', // observation services
};

function categoryForCode(code: string, formType: Claim['form_type']): string {
  const map = formType === 'CMS-1500' ? CPT_CATEGORY_MAP : REVENUE_CATEGORY_MAP;
  const key = map[code];
  if (!key) {
    throw new Error(`computeClaimCoverage: no coverage category mapped for ${formType} code "${code}"`);
  }
  return key;
}

function billingProviderNpi(claim: Claim): string | null {
  return claim.form_type === 'CMS-1500' ? claim.box33_billing_provider.npi : claim.billing_provider_npi;
}

function lookupNetworkAndMember(claim: Claim): { network: NetworkDirectoryEntry; member: MemberAccumulatorEntry } {
  const npi = billingProviderNpi(claim);
  const network = npi ? networkDirectory.find((p) => p.provider_npi === npi) : undefined;
  if (!network) {
    throw new Error(`no network-directory entry for provider NPI "${npi}"`);
  }

  const member = memberAccumulators.find((m) => m.member_id === claim.patient.member_id);
  if (!member) {
    throw new Error(`no member-accumulator entry for member_id "${claim.patient.member_id}"`);
  }

  return { network, member };
}

/**
 * The two raw facts a real adjuster would always have on hand alongside any
 * claim (a member-eligibility panel, a network-status lookup — see this
 * file's own header comment) but which don't live on the claim form itself.
 * Used to give Call 1 the same inputs a human has, for every claim
 * uniformly — never only for the claims where it happens to matter, which
 * would itself be a tell (Phase 11 Pass A1 finding, 2026-07-31).
 */
export function getMemberBenefitStatus(claim: Claim): {
  deductibleRemaining: number;
  isInNetwork: boolean;
  inpatientDaysUsedThisPlanYear: number;
  annualInpatientDayCap: number;
} {
  const { network, member } = lookupNetworkAndMember(claim);
  return {
    deductibleRemaining: member.deductible_remaining,
    isInNetwork: network.network_status === 'in-network',
    inpatientDaysUsedThisPlanYear: member.inpatient_days_used_this_plan_year,
    annualInpatientDayCap: CAPS.inpatientBenefitDaysPerPlanYear,
  };
}

export function computeClaimCoverage(claim: Claim): CoverageResult {
  const { network, member } = lookupNetworkAndMember(claim);

  // CMS-1500's box24f_charge is a per-unit rate (must be multiplied by
  // box24g_units — confirmed against claim.total_charge on multi-unit
  // lines). UB-04's box47_total_charge is already the line total;
  // box46_service_units there is descriptive only, not a multiplier.
  const lines: LineChargeInput[] =
    claim.form_type === 'CMS-1500'
      ? claim.box24_service_lines.map((l) => ({
          charge: l.box24f_charge * l.box24g_units,
          categoryKey: categoryForCode(l.box24d_procedure_code, 'CMS-1500'),
        }))
      : claim.box42_49_revenue_lines.map((l) => ({
          charge: l.box47_total_charge,
          categoryKey: categoryForCode(l.box42_revenue_code, 'UB-04'),
        }));

  const isEmergency = lines.some((l) => l.categoryKey === 'emergency_department');

  return computeCoverage({
    lines,
    deductibleRemaining: member.deductible_remaining,
    isInNetwork: network.network_status === 'in-network',
    isEmergency,
  });
}
