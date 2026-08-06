// One-time authoring tool — Phase 13 Pass F (project-spec.txt Section 10 scale-up,
// see build CLAUDE.md). Produces 103 new, hand-designed claims (bringing the seed
// set from 20 to 123) and appends them to claims-seed-data.json, along with the
// member-accumulator entries they need. Run once via `npx tsx scripts/author-pass-f-claims.ts`;
// kept in the repo afterward as a record of how this pass's data was built, the
// same way generate-coverage-policy.ts documents how the coverage corpus was built.
//
// Design (agreed with Joseph before writing):
// - Category totals across all 123 claims: clean 72, fraud 18, complex-math 13,
//   ambiguous 12, missing-data 8 — new-claim counts here are each target minus
//   what the original 20 already contribute (clean +68, fraud +11, complex-math
//   +10, ambiguous +9, missing-data +5).
// - 16 linked pairs (32 claims) among the new 103, ~31% — none linked back to the
//   original 20.
// - Age 25-80, skewed >50 with real 20s/30s/40s representation; 4 non-binary
//   ('NB') patients, all under 50; genders otherwise ~even; last names spanning
//   Caucasian, South Asian, East Asian, Hispanic, and "all-American" surnames.
// - 18 new providers (17 -> 35), several reused heavily across claims.
// - Submission-date recency is expressed via existing urgency_target/sla_tier
//   combinations, not new code (per project-spec.txt Section 11's mechanism) —
//   skewed toward recent, three practically-distinct achievable bands (roughly
//   today/hours-old, several-days-old, one-to-three-weeks-old, plus a smaller
//   near-the-30-day-cap band), rather than five precisely-bounded day windows,
//   since URGENCY_BANDS' four fractional bands don't subdivide any finer than that.

import * as fs from 'fs';
import * as path from 'path';
import type {
  Claim,
  CMS1500Claim,
  UB04Claim,
  CMS1500ServiceLine,
  Patient,
  SlaTier,
  UrgencyTarget,
  ScenarioCategory,
  BillingProvider,
} from '../src/lib/claims/types';

const ROOT = path.join(__dirname, '..', 'src', 'lib', 'claims');

interface MemberAccum {
  member_id: string;
  plan_year: number;
  deductible_individual_limit: number;
  deductible_remaining: number;
  inpatient_days_used_this_plan_year: number;
  as_of: string;
}

const AS_OF = '2026-08-04';
const newMembers: MemberAccum[] = [];
let memberSeq = 1;

function pt(name: string, dob: string, sex: Patient['sex'], deductibleRemaining: number, inpatientDaysUsed = 0): Patient {
  const member_id = `MBR-70${String(memberSeq++).padStart(5, '0')}`;
  newMembers.push({
    member_id,
    plan_year: 2026,
    deductible_individual_limit: 500,
    deductible_remaining: deductibleRemaining,
    inpatient_days_used_this_plan_year: inpatientDaysUsed,
    as_of: AS_OF,
  });
  return { name, dob, sex, member_id };
}

// ---- timing helper -------------------------------------------------------
// See header note: three practically-distinct bands out of the existing
// (sla_tier, urgency_target) mechanism, skewed recent.
type Recency = 'today' | 'recent' | 'mid' | 'old';
const TIMING: Record<Recency, { sla: SlaTier; urgency: UrgencyTarget }> = {
  today: { sla: 'urgent', urgency: 'fresh' }, // hours ago
  recent: { sla: 'standard', urgency: 'fresh' }, // ~0.5-4.5 days ago
  mid: { sla: 'standard', urgency: 'mid' }, // ~9-18 days ago
  old: { sla: 'standard', urgency: 'near_deadline' }, // ~24-28.5 days ago
};

let recencyCounter = 0;
// Weighted cycle: today/recent most common, mid next, old least — matches the
// requested skew (several today, several 2-4ish days, fewer mid-range, fewest old).
const RECENCY_CYCLE: Recency[] = ['today', 'recent', 'today', 'mid', 'recent', 'today', 'recent', 'mid', 'old', 'recent', 'today', 'mid'];
function nextTiming() {
  const r = RECENCY_CYCLE[recencyCounter % RECENCY_CYCLE.length];
  recencyCounter++;
  return TIMING[r];
}

// ---- CMS-1500 / UB-04 builders -------------------------------------------

interface LineSpec {
  date: string;
  pos: string;
  code: string;
  modifiers?: string[];
  dxPointer: string;
  charge: number;
  units?: number;
  npi: string | null;
}

function cms(opts: {
  id: string;
  linked?: string | null;
  patient: Patient;
  otherIns?: CMS1500Claim['insured_other'];
  otherInsMarked?: boolean;
  dx: string[];
  priorAuth?: string | null;
  lines: LineSpec[];
  billing: BillingProvider;
  info?: string;
  timing?: Recency;
  scenario: ScenarioCategory;
  label: string;
  note: string;
  missingField?: string;
}): CMS1500Claim {
  const service_lines: CMS1500ServiceLine[] = opts.lines.map((l, i) => ({
    line: i + 1,
    box24a_date_of_service: l.date,
    box24b_place_of_service: l.pos,
    box24d_procedure_code: l.code,
    ...(l.modifiers ? { box24d_modifiers: l.modifiers } : {}),
    box24e_diagnosis_pointer: l.dxPointer,
    box24f_charge: l.charge,
    box24g_units: l.units ?? 1,
    box24j_rendering_provider_npi: l.npi,
  }));
  const total = service_lines.reduce((s, l) => s + l.box24f_charge * l.box24g_units, 0);
  const { sla, urgency } = opts.timing ? TIMING[opts.timing] : nextTiming();
  return {
    claim_id: opts.id,
    form_type: 'CMS-1500',
    linked_claim_id: opts.linked ?? null,
    patient: opts.patient,
    insured_other: opts.otherIns ?? { has_other_insurance: false },
    box9_11d_other_insurance_marked: opts.otherInsMarked ?? false,
    box21_diagnoses: opts.dx,
    box23_prior_auth_number: opts.priorAuth ?? null,
    box24_service_lines: service_lines,
    box33_billing_provider: opts.billing,
    ...(opts.info ? { box19_additional_claim_information: opts.info } : {}),
    total_charge: total,
    sla_tier: sla,
    urgency_target: urgency,
    _testMeta: {
      scenario: opts.scenario,
      scenario_label: opts.label,
      note: opts.note,
      ...(opts.missingField ? { deliberately_missing_field: opts.missingField } : {}),
    },
  };
}

interface RevLineSpec {
  date: string;
  rev: string;
  hcpcs?: string;
  charge: number;
  units?: number;
}

function ub(opts: {
  id: string;
  linked?: string | null;
  patient: Patient;
  otherIns?: UB04Claim['insured_other'];
  tob: string;
  period: { from: string; through: string };
  conditionCodes?: string[];
  occurrenceCodes?: { code: string; date: string }[];
  valueCodes?: { code: string; amount: number }[];
  lines: RevLineSpec[];
  principalDx: string | null;
  attendingNpi: string | null;
  billingName: string;
  billingNpi: string;
  remarks?: string;
  timing?: Recency;
  scenario: ScenarioCategory;
  label: string;
  note: string;
  missingField?: string;
}): UB04Claim {
  const box42_49_revenue_lines = opts.lines.map((l, i) => ({
    line: i + 1,
    box42_revenue_code: l.rev,
    ...(l.hcpcs ? { box44_hcpcs_code: l.hcpcs } : {}),
    box45_service_date: l.date,
    box46_service_units: l.units ?? 1,
    box47_total_charge: l.charge,
  }));
  const total = box42_49_revenue_lines.reduce((s, l) => s + l.box47_total_charge, 0);
  const { sla, urgency } = opts.timing ? TIMING[opts.timing] : nextTiming();
  return {
    claim_id: opts.id,
    form_type: 'UB-04',
    linked_claim_id: opts.linked ?? null,
    patient: opts.patient,
    insured_other: opts.otherIns ?? { has_other_insurance: false },
    box4_type_of_bill: opts.tob,
    box6_statement_covers_period: opts.period,
    box18_28_condition_codes: opts.conditionCodes ?? [],
    box31_34_occurrence_codes: opts.occurrenceCodes ?? [],
    box39_41_value_codes: opts.valueCodes ?? [],
    box42_49_revenue_lines,
    box67_principal_diagnosis: opts.principalDx,
    box76_attending_provider_npi: opts.attendingNpi,
    billing_provider_name: opts.billingName,
    billing_provider_npi: opts.billingNpi,
    ...(opts.remarks ? { box80_remarks: opts.remarks } : {}),
    total_charge: total,
    sla_tier: sla,
    urgency_target: urgency,
    _testMeta: {
      scenario: opts.scenario,
      scenario_label: opts.label,
      note: opts.note,
      ...(opts.missingField ? { deliberately_missing_field: opts.missingField } : {}),
    },
  };
}

const claims: Claim[] = [];

// ===========================================================================
// FRAUD (11 new: 7 standalone + 2 linked pairs)
// ===========================================================================

claims.push(
  cms({
    id: 'FRD-PHANTOM-02',
    patient: pt('Desmond Achebe', '1979-11-02', 'M', 500),
    dx: ['M79.601'],
    lines: [{ date: '2026-08-01', pos: '11', code: '20610', dxPointer: 'A', charge: 660, npi: '1600113311' }],
    billing: { name: 'Fenwick Family Wellness Clinic', npi: '1600113311', address: '14 Fenwick Commons, Salem, OR' },
    info: 'No encounter note on file for this date of service; scheduling system shows no appointment booked for this patient that day.',
    scenario: 'fraud',
    label: 'fraud-phantom-billing',
    note: 'Billed injection charge is well above the typical rate for CPT 20610 with no supporting clinical note or appointment record — no plausible supporting encounter. One of 3 claims sharing Fenwick Family Wellness Clinic’s identity for a second, independent volume-spike pattern (see provider-history.json).',
  }),
  cms({
    id: 'FRD-UNBUNDLE-02',
    patient: pt('Ingrid Solheim', '1985-03-14', 'F', 500),
    dx: ['L02.91'],
    lines: [
      { date: '2026-07-30', pos: '11', code: '10060', dxPointer: 'A', charge: 290, npi: '1600113311' },
      { date: '2026-07-30', pos: '11', code: '12001', dxPointer: 'A', charge: 195, npi: '1600113311' },
    ],
    billing: { name: 'Fenwick Family Wellness Clinic', npi: '1600113311', address: '14 Fenwick Commons, Salem, OR' },
    scenario: 'fraud',
    label: 'fraud-unbundling',
    note: 'Simple I&D (10060) and a superficial wound repair (12001) billed as two separate lines for the same site/date — a single comprehensive code would normally capture both. Same provider as FRD-PHANTOM-02 and FRD-DOUBLEBILL-02 (second volume-spike pattern).',
  }),
  cms({
    id: 'FRD-DOUBLEBILL-02',
    patient: pt('Preston Villareal', '1970-06-25', 'M', 500),
    dx: ['M54.50'],
    lines: [
      { date: '2026-07-29', pos: '11', code: '97140', dxPointer: 'A', charge: 65, npi: '1600113311' },
      { date: '2026-07-29', pos: '11', code: '97140', dxPointer: 'A', charge: 65, npi: '1600113311' },
    ],
    billing: { name: 'Fenwick Family Wellness Clinic', npi: '1600113311', address: '14 Fenwick Commons, Salem, OR' },
    scenario: 'fraud',
    label: 'fraud-double-billing',
    note: 'Two identical line items — same date, same code (97140), same charge — for what should be a single session. Same provider as FRD-PHANTOM-02 and FRD-UNBUNDLE-02 (second volume-spike pattern).',
  }),
  cms({
    id: 'FRD-PHANTOM-03',
    patient: pt('Harriet Solberg', '1958-02-19', 'F', 320),
    dx: ['M79.604'],
    lines: [{ date: '2026-07-27', pos: '11', code: '20605', dxPointer: 'A', charge: 580, npi: '1600113388' }],
    billing: { name: 'Trailhead Urgent Care', npi: '1600113388', address: '19 Trailhead Loop, Bend, OR' },
    info: 'No clinical documentation, vitals, or intake record exists for this date of service.',
    scenario: 'fraud',
    label: 'fraud-phantom-billing',
    note: 'A billed intermediate-joint-injection charge with zero supporting clinical documentation — no intake, no vitals, no note. No plausible supporting encounter.',
  }),
  cms({
    id: 'FRD-UNBUNDLE-03',
    patient: pt('Consuela Marroquin', '1994-09-08', 'F', 500),
    dx: ['L03.115'],
    lines: [
      { date: '2026-07-26', pos: '11', code: '10061', dxPointer: 'A', charge: 340, npi: '1600113344' },
      { date: '2026-07-26', pos: '11', code: '12002', dxPointer: 'A', charge: 210, npi: '1600113344' },
    ],
    billing: { name: 'Dr. Colin Bramwell, MD (General Surgery)', npi: '1600113344', address: '3 Bramwell Surgical Court, Medford, OR' },
    scenario: 'fraud',
    label: 'fraud-unbundling',
    note: 'Complicated I&D (10061) and a wound closure (12002) billed separately for the same site and date — normally captured under one comprehensive code.',
  }),
  cms({
    id: 'FRD-SUBSTANDARD-02',
    patient: pt('Trevor Maddox', '1999-12-30', 'M', 500),
    dx: ['R05.9'],
    lines: [{ date: '2026-07-24', pos: '11', code: '96365', dxPointer: 'A', charge: 410, npi: '1600113388' }],
    billing: { name: 'Trailhead Urgent Care', npi: '1600113388', address: '19 Trailhead Loop, Bend, OR' },
    info: 'Pt reports cough x3 days, no fever, lungs clear on exam, ambulatory and well-appearing at intake.',
    scenario: 'fraud',
    label: 'fraud-unnecessary-substandard-care',
    note: 'IV infusion therapy (CPT 96365) billed against a diagnosis of an uncomplicated cough — the intensity of the billed service doesn’t logically follow from the diagnosis or the intake note.',
  }),
  ub({
    id: 'FRD-UPCODE-02',
    patient: pt('Josefina Bautista', '1982-04-17', 'F', 500),
    tob: '131',
    period: { from: '2026-07-22', through: '2026-07-22' },
    lines: [{ date: '2026-07-22', rev: '0206', hcpcs: '99291', charge: 3900 }],
    principalDx: 'R10.9',
    attendingNpi: '1600113399',
    billingName: 'Mercy Point Community Hospital',
    billingNpi: '1600113399',
    remarks: 'Patient alert and comfortable throughout ED course; discharged home same-day, no ICU-level intervention documented.',
    scenario: 'fraud',
    label: 'fraud-upcoding',
    note: 'Critical-care revenue code/HCPCS (0206/99291) billed for a same-day abdominal-pain workup with no documented ICU-level intervention — the admission details don’t justify critical-care intensity.',
  })
);

{
  const p1 = pt('Nadia Okwuosa', '1966-08-11', 'F', 0);
  claims.push(
    cms({
      id: 'FRD-MISMATCH-02A',
      linked: 'FRD-MISMATCH-02B',
      patient: p1,
      dx: ['N10'],
      lines: [
        { date: '2026-07-20', pos: '21', code: '99221', dxPointer: 'A', charge: 250, npi: '1600113400' },
        { date: '2026-07-21', pos: '21', code: '99231', dxPointer: 'A', charge: 90, npi: '1600113400' },
      ],
      billing: { name: 'Dr. Preston Okwuosa, MD (Internal Medicine)', npi: '1600113400', address: '410 Marigold Medical Park, Springfield, OR' },
      scenario: 'fraud',
      label: 'fraud-documentation-mismatch-professional',
      note: 'Attending physician documented only 2 low-complexity visits for routine acute pyelonephritis recovery — linked facility claim FRD-MISMATCH-02B bills for a 4-day ICU-level stay. The mismatch between the two linked documents is the actual signal here.',
    }),
    ub({
      id: 'FRD-MISMATCH-02B',
      linked: 'FRD-MISMATCH-02A',
      patient: p1,
      tob: '111',
      period: { from: '2026-07-20', through: '2026-07-23' },
      lines: [{ date: '2026-07-20', rev: '0206', hcpcs: '99291', charge: 15600, units: 4 }],
      principalDx: 'N10',
      attendingNpi: '1600113400',
      billingName: 'Mercy Point Community Hospital',
      billingNpi: '1600113399',
      remarks: 'Patient remained clinically stable throughout admission; transitioned to oral antibiotics by day 2.',
      scenario: 'fraud',
      label: 'fraud-documentation-mismatch-facility',
      note: 'Bills all 4 days at ICU-level critical-care revenue code/HCPCS for uncomplicated pyelonephritis — far more extensive than the linked professional claim’s own documented visits support. Caught only by comparing the two linked claims.',
    })
  );
}

{
  const p2 = pt('Elias Thorsen', '1954-05-27', 'M', 0);
  claims.push(
    cms({
      id: 'FRD-MISMATCH-03A',
      linked: 'FRD-MISMATCH-03B',
      patient: p2,
      dx: ['I21.4'],
      lines: [
        { date: '2026-07-18', pos: '21', code: '99231', dxPointer: 'A', charge: 95, npi: '1600112233' },
        { date: '2026-07-19', pos: '21', code: '99231', dxPointer: 'A', charge: 95, npi: '1600112233' },
      ],
      billing: { name: 'Dr. Anjali Rao, MD (Cardiology)', npi: '1600112233', address: '19 Heartline Cardiology Suites, Salem, OR' },
      scenario: 'fraud',
      label: 'fraud-documentation-mismatch-professional',
      note: 'Attending cardiologist documented only 2 stable, low-complexity follow-up visits for a resolving NSTEMI — linked facility claim FRD-MISMATCH-03B bills for a 5-day ICU-level stay. Signal only visible by comparing the two linked claims.',
    }),
    ub({
      id: 'FRD-MISMATCH-03B',
      linked: 'FRD-MISMATCH-03A',
      patient: p2,
      tob: '111',
      period: { from: '2026-07-18', through: '2026-07-22' },
      lines: [{ date: '2026-07-18', rev: '0206', hcpcs: '99291', charge: 19500, units: 5 }],
      principalDx: 'I21.4',
      attendingNpi: '1600112233',
      billingName: 'Mercy Point Community Hospital',
      billingNpi: '1600113399',
      remarks: 'Patient hemodynamically stable throughout, ambulating independently by day 2, no further intervention required.',
      scenario: 'fraud',
      label: 'fraud-documentation-mismatch-facility',
      note: 'Bills all 5 days at ICU-level critical-care revenue code/HCPCS for what the linked professional claim documents as a stable, low-complexity recovery — far more extensive than supported.',
    })
  );
}

// ===========================================================================
// COMPLEX-MATH (10 new: 4 standalone + 3 linked pairs)
// ===========================================================================

claims.push(
  cms({
    id: 'CPX-CMS-02',
    patient: pt('Grant Sutherland', '1963-01-09', 'M', 180),
    dx: ['I10', 'E78.5'],
    lines: [
      { date: '2026-07-23', pos: '11', code: '99214', dxPointer: 'A', charge: 140, npi: '1600113400' },
      { date: '2026-07-23', pos: '11', code: '80061', dxPointer: 'B', charge: 90, npi: '1600113400' },
      { date: '2026-07-23', pos: '11', code: '93000', dxPointer: 'A', charge: 130, npi: '1600113400' },
    ],
    billing: { name: 'Dr. Preston Okwuosa, MD (Internal Medicine)', npi: '1600113400', address: '410 Marigold Medical Park, Springfield, OR' },
    scenario: 'complex-math',
    label: 'complex-math-cms1500-deductible-crossing',
    note: 'Three-line visit where the remaining deductible ($180) is exhausted partway through line 2 — line 1 applies fully to deductible, line 2 splits, line 3 is covered at the plan’s post-deductible rate. A calculation problem, not a judgment call.',
  }),
  cms({
    id: 'CPX-CMS-03',
    patient: pt('Farrah Callahan', '1988-10-22', 'F', 100),
    dx: ['D22.9'],
    lines: [
      { date: '2026-07-25', pos: '11', code: '11402', dxPointer: 'A', charge: 60, npi: '1600113366' },
      { date: '2026-07-25', pos: '11', code: '11403', dxPointer: 'A', charge: 220, npi: '1600113366' },
    ],
    billing: { name: 'Dr. Farrah Delacroix, MD (Dermatology)', npi: '1600113366', address: '88 Elmcrest Dermatology, Hillsboro, OR' },
    scenario: 'complex-math',
    label: 'complex-math-cms1500-deductible-crossing',
    note: 'Remaining deductible ($100) is exhausted partway through line 2’s larger excision charge — a clean example of a deductible crossing within a single line item rather than between lines.',
  }),
  cms({
    id: 'CPX-CMS-04',
    patient: pt('Douglas Hargrove', '1957-07-03', 'M', 0),
    dx: ['N18.4'],
    lines: [{ date: '2026-07-28', pos: '11', code: '99215', dxPointer: 'A', charge: 300, npi: '1600112288' }],
    billing: { name: 'Dr. Simon Okafor, MD (Nephrology)', npi: '1600112288', address: '5 Riverbend Renal Clinic, Salem, OR' },
    info: 'Per member’s benefit summary on file, deductible is already met and the member is within $140 of the plan’s annual out-of-pocket maximum.',
    scenario: 'complex-math',
    label: 'complex-math-cms1500-oon-near-oop-max',
    note: 'Out-of-network specialist visit combined with the member sitting near the plan’s annual out-of-pocket maximum — the 60% out-of-network rate and the remaining out-of-pocket cushion both need to be shown transparently, not just the flat OON percentage.',
  }),
  cms({
    id: 'CPX-CMS-05',
    patient: pt('Rosalind Fletcher', '1971-04-30', 'F', 0),
    otherIns: { has_other_insurance: true, other_insurer_name: 'Pacific Sun Secondary Health Plan', details_provided: true },
    otherInsMarked: true,
    dx: ['M17.11'],
    lines: [{ date: '2026-07-26', pos: '11', code: '99214', dxPointer: 'A', charge: 300, npi: '1600113355' }],
    billing: { name: 'Juniper Family Medicine', npi: '1600113355', address: '58 Juniper Ave, Bend, OR' },
    info: 'Secondary plan (Pacific Sun Secondary Health Plan) confirmed to cover 20% of the member’s post-primary responsibility, per the coordination-of-benefits form on file.',
    scenario: 'complex-math',
    label: 'complex-math-cms1500-cob-split',
    note: 'Unlike an ambiguous coordination-of-benefits case, the secondary payer and its exact split are both confirmed here — this is a calculation of how much the secondary plan’s 20% actually nets off the member’s responsibility, not an unresolvable coverage question.',
  })
);

{
  const p3 = pt('Vernon Kowalczyk', '1961-02-14', 'M', 0, 58);
  claims.push(
    cms({
      id: 'CPX-CMB-02A',
      linked: 'CPX-CMB-02B',
      patient: p3,
      dx: ['J44.1'],
      lines: [
        { date: '2026-07-19', pos: '21', code: '99223', dxPointer: 'A', charge: 320, npi: '1633209547' },
        { date: '2026-07-20', pos: '21', code: '99232', dxPointer: 'A', charge: 140, npi: '1633209547' },
      ],
      billing: { name: 'Dr. Foster Langley, MD (Pulmonology)', npi: '1633209547', address: '77 Timberline Medical Tower, Eugene, OR' },
      scenario: 'complex-math',
      label: 'complex-math-combo-professional',
      note: 'Attending physician’s daily visit charges across a 4-day COPD admission — linked to CPX-CMB-02B, where the benefit-day-cap math actually applies.',
    }),
    ub({
      id: 'CPX-CMB-02B',
      linked: 'CPX-CMB-02A',
      patient: p3,
      tob: '111',
      period: { from: '2026-07-19', through: '2026-07-22' },
      valueCodes: [{ code: '23', amount: 380 }],
      lines: [
        { date: '2026-07-19', rev: '0120', charge: 7200, units: 4 },
        { date: '2026-07-19', rev: '0410', hcpcs: '94640', charge: 640, units: 4 },
      ],
      principalDx: 'J44.1',
      attendingNpi: '1633209547',
      billingName: 'Eugene Community Hospital',
      billingNpi: '1244557788',
      scenario: 'complex-math',
      label: 'complex-math-combo-benefit-day-cap',
      note: 'Room & board (rev code 0120) at 4 units crosses the plan’s annual inpatient benefit-day cap partway through this stay (58 days already used this plan year, cap at 60) — per-diem coverage rate changes for the remaining days. A calculation to show transparently, not a judgment call.',
    })
  );
}

{
  const p4 = pt('Curtis Bennett', '1969-11-19', 'M', 500);
  claims.push(
    cms({
      id: 'CPX-CMB-03A',
      linked: 'CPX-CMB-03B',
      patient: p4,
      dx: ['M23.51'],
      lines: [{ date: '2026-08-02', pos: '11', code: '99213', dxPointer: 'A', charge: 140, npi: '1408817225' }],
      billing: { name: 'Dr. Adaeze Nwosu, MD (Orthopedics)', npi: '1408817225', address: '12 Foothill Medical Building, Beaverton, OR' },
      info: 'Follow-up visit for post-operative knee soreness, 14 days after the linked arthroscopic procedure (CPX-CMB-03B).',
      scenario: 'complex-math',
      label: 'complex-math-cms1500-global-surgical-period',
      note: 'This office visit falls 14 days after the linked facility claim’s knee arthroscopy (CPX-CMB-03B) — inside a typical 90-day global surgical period, where routine post-op follow-up is normally bundled into the surgical fee rather than separately billable. Requires checking this claim’s date against the linked claim’s own surgery date to resolve.',
    }),
    ub({
      id: 'CPX-CMB-03B',
      linked: 'CPX-CMB-03A',
      patient: p4,
      tob: '131',
      period: { from: '2026-07-19', through: '2026-07-19' },
      lines: [
        { date: '2026-07-19', rev: '0360', hcpcs: '29881', charge: 3600 },
        { date: '2026-07-19', rev: '0250', charge: 450 },
      ],
      principalDx: 'M23.51',
      attendingNpi: '1408817225',
      billingName: 'Redwood Ambulatory Surgical Center',
      billingNpi: '1600113322',
      scenario: 'complex-math',
      label: 'complex-math-ub04-global-surgical-period',
      note: 'The original knee arthroscopy — its global surgical period is what determines whether the linked professional claim’s later office visit (CPX-CMB-03A) is separately billable or bundled.',
    })
  );
}

{
  const p5 = pt('Margaret Donovan', '1950-06-06', 'F', 0);
  const otherIns = { has_other_insurance: true, other_insurer_name: 'Evergreen Supplemental Plan', details_provided: true };
  claims.push(
    cms({
      id: 'CPX-CMB-04A',
      linked: 'CPX-CMB-04B',
      patient: p5,
      otherIns,
      otherInsMarked: true,
      dx: ['S72.001A'],
      lines: [{ date: '2026-07-21', pos: '21', code: '99223', dxPointer: 'A', charge: 310, npi: '1590744812' }],
      billing: { name: 'Dr. Grace Palladino, MD (Internal Medicine)', npi: '1590744812', address: '500 Cedar Health Pavilion, Salem, OR' },
      info: 'Evergreen Supplemental Plan confirmed as secondary, covering 15% of the member’s combined responsibility across both this claim and the linked facility claim (CPX-CMB-04B).',
      scenario: 'complex-math',
      label: 'complex-math-combo-professional-cob-split',
      note: 'Secondary payer’s 15% split is confirmed but applies across both linked claims’ combined patient responsibility, not this claim in isolation — the actual arithmetic requires netting both claims together.',
    }),
    ub({
      id: 'CPX-CMB-04B',
      linked: 'CPX-CMB-04A',
      patient: p5,
      otherIns,
      tob: '111',
      period: { from: '2026-07-21', through: '2026-07-24' },
      lines: [
        { date: '2026-07-21', rev: '0120', charge: 5100, units: 3 },
        { date: '2026-07-21', rev: '0710', hcpcs: '27245', charge: 8900 },
      ],
      principalDx: 'S72.001A',
      attendingNpi: '1590744812',
      billingName: 'Willamette Valley Regional Hospital',
      billingNpi: '1288650033',
      scenario: 'complex-math',
      label: 'complex-math-combo-facility-cob-split',
      note: 'Facility side of the same admission — the secondary payer’s 15% split (see linked CPX-CMB-04A) has to be calculated against the combined charge across both claims, a coordination-of-benefits calculation rather than an ambiguity.',
    })
  );
}

// ===========================================================================
// AMBIGUOUS (9 new: 5 standalone + 2 linked pairs)
// ===========================================================================

claims.push(
  cms({
    id: 'AMB-CMS-02',
    patient: pt('Simone Pierce', '1991-08-24', 'F', 500),
    dx: ['S93.401A'],
    lines: [{ date: '2026-07-27', pos: '11', code: '20605', dxPointer: 'A', charge: 240, npi: '1408817225' }],
    billing: { name: 'Dr. Adaeze Nwosu, MD (Orthopedics)', npi: '1408817225', address: '12 Foothill Medical Building, Beaverton, OR' },
    info: 'Persistent ankle effusion on exam following a sprain diagnosed 3 weeks prior; injection administered for symptom relief.',
    scenario: 'ambiguous',
    label: 'ambiguous-cms1500-diagnosis-procedure-plausibility',
    note: 'A joint injection (CPT 20605) billed against a simple ankle sprain diagnosis could reflect a legitimate persistent-effusion complication, or could be an intensity mismatch — genuinely unresolvable from this claim alone without the underlying exam findings.',
  }),
  cms({
    id: 'AMB-CMS-03',
    patient: pt('Nikhil Chandrasekaran', '1975-05-16', 'M', 500),
    dx: ['M48.062'],
    priorAuth: null,
    lines: [{ date: '2026-07-24', pos: '11', code: '64483', dxPointer: 'A', charge: 620, npi: '1600113300' }],
    billing: { name: 'Dr. Wanda Liu, MD (Rheumatology)', npi: '1600113300', address: '230 Cascade Rheumatology Group, Corvallis, OR' },
    scenario: 'ambiguous',
    label: 'ambiguous-cms1500-coverage-applicability',
    note: 'Epidural injection (CPT 64483) prior-auth requirements vary by plan rider — Box 23 is blank, but that alone isn’t an error. Genuinely unresolvable coverage-applicability question from this claim alone.',
  }),
  cms({
    id: 'AMB-CMS-04',
    patient: pt('Denise Larsen', '1969-09-02', 'F', 500),
    otherIns: { has_other_insurance: true, other_insurer_name: 'Undisclosed employer wellness plan', details_provided: false },
    otherInsMarked: true,
    dx: ['M79.1'],
    lines: [{ date: '2026-07-25', pos: '11', code: '97140', dxPointer: 'A', charge: 65, npi: '1600113355' }],
    billing: { name: 'Juniper Family Medicine', npi: '1600113355', address: '58 Juniper Ave, Bend, OR' },
    info: 'Pt mentions a workplace wellness benefit that may also cover manual therapy; no specifics available at time of visit.',
    scenario: 'ambiguous',
    label: 'ambiguous-cms1500-coordination-of-benefits',
    note: 'Other-insurance marked yes with no specifics (Box 9/11d) — a genuinely unresolvable coordination-of-benefits split from this claim alone.',
  }),
  cms({
    id: 'AMB-CMS-05',
    patient: pt('Hiroshi Matsuda', '1965-12-11', 'M', 500),
    dx: ['J01.90'],
    lines: [{ date: '2026-07-23', pos: '11', code: '99213', dxPointer: 'A', charge: 120, npi: '1600112277' }],
    billing: { name: 'Coastal Gastroenterology Group', npi: '1600112277', address: '900 Tideline Medical Bldg, Newport, OR' },
    info: 'Patient’s on-file address is in the Portland metro area, well outside this provider’s Newport service area, for a routine sinusitis visit that would typically be handled locally.',
    scenario: 'ambiguous',
    label: 'ambiguous-cms1500-provider-pattern-oddity',
    note: 'Statistically unusual travel distance for a routine visit type, with no other red flags present — a provider-pattern oddity worth a human look, not a clear fraud signal.',
  }),
  cms({
    id: 'AMB-CMS-06',
    patient: pt('Emilio Ochoa', '1980-03-27', 'M', 260),
    dx: ['M25.561'],
    lines: [{ date: '2026-07-28', pos: '22', code: '20611', dxPointer: 'A', charge: 380, npi: '1600112233' }],
    billing: { name: 'Dr. Anjali Rao, MD (Cardiology)', npi: '1600112233', address: '19 Heartline Cardiology Suites, Salem, OR' },
    info: 'Image-guided injection performed in an outpatient hospital setting rather than the billing provider’s own office.',
    scenario: 'ambiguous',
    label: 'ambiguous-cms1500-diagnosis-procedure-plausibility',
    note: 'Setting (outpatient hospital, POS 22) for a routine knee injection is atypical for this diagnosis — could reflect a legitimate access-related reason or an appropriateness-of-setting question, unresolvable from the claim alone.',
  })
);

{
  const p6 = pt('Fatima Noorzai', '1988-01-05', 'F', 500);
  claims.push(
    cms({
      id: 'AMB-CMB-02A',
      linked: 'AMB-CMB-02B',
      patient: p6,
      dx: ['S82.001A'],
      lines: [
        { date: '2026-07-22', pos: '21', code: '99223', dxPointer: 'A', charge: 300, npi: '1477610239' },
        { date: '2026-07-23', pos: '21', code: '99232', dxPointer: 'A', charge: 140, npi: '1477610239' },
      ],
      billing: { name: 'Dr. Imani Osei, MD (Pulmonology)', npi: '1477610239', address: '14 Summit Pulmonary Group, Medford, OR' },
      scenario: 'ambiguous',
      label: 'ambiguous-combo-professional',
      note: 'Attending physician’s inpatient visit charges for a fall-related tibia fracture — linked to AMB-CMB-02B (UB-04 facility claim), where the responsible-party ambiguity actually lives.',
    }),
    ub({
      id: 'AMB-CMB-02B',
      linked: 'AMB-CMB-02A',
      patient: p6,
      tob: '111',
      period: { from: '2026-07-22', through: '2026-07-25' },
      conditionCodes: ['02'],
      occurrenceCodes: [{ code: '03', date: '2026-07-22' }],
      lines: [
        { date: '2026-07-22', rev: '0120', charge: 4800, units: 3 },
        { date: '2026-07-22', rev: '0710', hcpcs: '27758', charge: 8100 },
      ],
      principalDx: 'S82.001A',
      attendingNpi: '1477610239',
      billingName: 'Rogue Valley Medical Center',
      billingNpi: '1200558842',
      remarks: 'Intake nursing note records the fall as occurring ‘on the loading dock at work’; patient’s own statement to the case manager the next day describes stumbling on icy stairs at home.',
      scenario: 'ambiguous',
      label: 'ambiguous-combo-facility',
      note: 'Condition code marks this as possibly employment-related, but the occurrence-code accident date and free-text history conflict about whether this fall happened at work or at home — a genuine responsible-party conflict unresolvable from the claim alone.',
    })
  );
}

{
  const p7 = pt('Camila Fuentes', '1977-10-13', 'F', 0);
  claims.push(
    cms({
      id: 'AMB-CMB-03A',
      linked: 'AMB-CMB-03B',
      patient: p7,
      priorAuth: 'PA-991204',
      dx: ['M23.51'],
      lines: [{ date: '2026-07-24', pos: '21', code: '99223', dxPointer: 'A', charge: 320, npi: '1911023845' }],
      billing: { name: 'Dr. Renee Kowalski, MD (Family Medicine)', npi: '1911023845', address: '230 Elm Family Health Clinic, Hillsboro, OR' },
      info: 'Prior auth PA-991204 on file authorizes diagnostic knee arthroscopy only.',
      scenario: 'ambiguous',
      label: 'ambiguous-cms1500-coverage-applicability',
      note: 'The professional claim’s prior auth covers diagnostic arthroscopy — whether it also covers the meniscus repair actually performed (per the linked facility claim, AMB-CMB-03B) is a genuine coverage-applicability question.',
    }),
    ub({
      id: 'AMB-CMB-03B',
      linked: 'AMB-CMB-03A',
      patient: p7,
      tob: '131',
      period: { from: '2026-07-24', through: '2026-07-24' },
      lines: [
        { date: '2026-07-24', rev: '0360', hcpcs: '29882', charge: 3900 },
        { date: '2026-07-24', rev: '0250', charge: 420 },
      ],
      principalDx: 'M23.51',
      attendingNpi: '1911023845',
      billingName: 'Redwood Ambulatory Surgical Center',
      billingNpi: '1600113322',
      remarks: 'Diagnostic arthroscopy was extended intraoperatively to include meniscus repair once the tear was visualized.',
      scenario: 'ambiguous',
      label: 'ambiguous-ub04-coverage-applicability',
      note: 'Bills for arthroscopy with meniscus repair (29882), while the linked professional claim’s prior auth (AMB-CMB-03A) only names diagnostic arthroscopy — whether the authorization extends to the repair actually performed isn’t resolvable from either claim alone.',
    })
  );
}

// ===========================================================================
// MISSING-DATA (5 new: 3 standalone + 1 linked pair)
// ===========================================================================

claims.push(
  cms({
    id: 'MIS-CMS-02',
    patient: pt('Bradley Anderson', '1973-02-08', 'M', 500),
    dx: ['I25.10'],
    lines: [
      { date: '2026-07-27', pos: '11', code: '99214', dxPointer: 'A', charge: 210, npi: '1600112233' },
      { date: '2026-07-27', pos: '11', code: '93000', dxPointer: 'A', charge: 95, npi: null },
    ],
    billing: { name: 'Dr. Anjali Rao, MD (Cardiology)', npi: '1600112233' },
    scenario: 'missing-data',
    label: 'missing-data-cms1500-material',
    note: 'Rendering-provider NPI (Box 24J) is blank on the EKG line — material, since network status is verified per rendering provider, not just per billing entity. Should hold the claim (Request Additional Info), pausing the SLA clock, rather than proceed to coverage math.',
    missingField: 'box24_service_lines[1].box24j_rendering_provider_npi',
  }),
  cms({
    id: 'MIS-CMS-03',
    patient: pt('Meera Deshmukh', '1990-07-19', 'F', 500),
    dx: ['I48.91'],
    lines: [{ date: '2026-07-26', pos: '11', code: '93005', dxPointer: 'A', charge: 90, npi: null }],
    billing: { name: 'Dr. Anjali Rao, MD (Cardiology)', npi: '1600112233', address: '19 Heartline Cardiology Suites, Salem, OR' },
    scenario: 'missing-data',
    label: 'missing-data-cms1500-material',
    note: 'Rendering-provider NPI (Box 24J) is blank on this EKG line — material, since network status is verified per-rendering-provider, not just per-billing-entity. Should hold rather than proceed.',
    missingField: 'box24_service_lines[0].box24j_rendering_provider_npi',
  }),
  cms({
    id: 'MIS-CMS-04',
    patient: pt('Wei Lin', '1962-11-24', 'M', 0),
    dx: ['N18.3'],
    lines: [{ date: '2026-07-25', pos: '11', code: '99214', dxPointer: 'A', charge: 190, npi: '1600112288' }],
    billing: { name: 'Dr. Simon Okafor, MD (Nephrology)', npi: '1600112288' },
    scenario: 'missing-data',
    label: 'missing-data-cms1500-non-material',
    note: 'Billing provider’s street address (Box 33) is blank — non-material, since network status is already resolvable from the NPI on file and nothing downstream depends on the address. Correct recommendation is still Approve, with the gap flagged as a non-blocking data-quality note.',
    missingField: 'box33_billing_provider.address',
  })
);

{
  const p8 = pt('Andre Kwon', '1955-06-02', 'M', 500);
  claims.push(
    cms({
      id: 'MIS-CMB-02A',
      linked: 'MIS-CMB-02B',
      patient: p8,
      dx: ['J18.9'],
      lines: [{ date: '2026-07-21', pos: '21', code: '99222', dxPointer: 'A', charge: 265, npi: '1600113400' }],
      billing: { name: 'Dr. Preston Okwuosa, MD (Internal Medicine)', npi: '1600113400', address: '410 Marigold Medical Park, Springfield, OR' },
      scenario: 'missing-data',
      label: 'missing-data-combo-professional',
      note: 'This professional claim is complete — the deliberate gap lives on the linked facility claim, MIS-CMB-02B.',
    }),
    ub({
      id: 'MIS-CMB-02B',
      linked: 'MIS-CMB-02A',
      patient: p8,
      tob: '111',
      period: { from: '2026-07-21', through: '2026-07-24' },
      lines: [
        { date: '2026-07-21', rev: '0120', charge: 4650, units: 3 },
        { date: '2026-07-21', rev: '0730', hcpcs: '94640', charge: 300, units: 2 },
      ],
      principalDx: null,
      attendingNpi: '1600113400',
      billingName: 'Eugene Community Hospital',
      billingNpi: '1244557788',
      scenario: 'missing-data',
      label: 'missing-data-combo-facility',
      note: 'Principal diagnosis (Box 67) is blank — required on the UB-04 to support the billed revenue/HCPCS lines. Material gap; should hold rather than proceed.',
      missingField: 'box67_principal_diagnosis',
    })
  );
}

// ===========================================================================
// CLEAN (68 new: 52 standalone + 8 linked pairs), generated from a template
// pool for structural variety without hand-authoring 68 individual scenarios —
// clean claims carry no narrative signal the way the "interesting" claims
// above do, so the effort is spent on demographic/clinical variety instead.
// ===========================================================================

const cmsProviders: { npi: string; name: string; address: string }[] = [
  { npi: '1911023845', name: 'Dr. Renee Kowalski, MD (Family Medicine)', address: '230 Elm Family Health Clinic, Hillsboro, OR' },
  { npi: '1600113355', name: 'Juniper Family Medicine', address: '58 Juniper Ave, Bend, OR' },
  { npi: '1600113400', name: 'Dr. Preston Okwuosa, MD (Internal Medicine)', address: '410 Marigold Medical Park, Springfield, OR' },
  { npi: '1600112233', name: 'Dr. Anjali Rao, MD (Cardiology)', address: '19 Heartline Cardiology Suites, Salem, OR' },
  { npi: '1600112244', name: 'Dr. Yusuf Karimi, MD (Endocrinology)', address: '77 Meridian Endocrine Center, Eugene, OR' },
  { npi: '1600112255', name: 'Summit Ridge OB/GYN Associates', address: '340 Summit Ridge Way, Bend, OR' },
  { npi: '1600112266', name: 'Dr. Naomi Fitzgerald, MD (Psychiatry)', address: '12 Aspen Behavioral Health, Portland, OR' },
  { npi: '1600112299', name: 'Pinehurst ENT & Sinus Center', address: '61 Pinehurst Commons, Medford, OR' },
  { npi: '1600113300', name: 'Dr. Wanda Liu, MD (Rheumatology)', address: '230 Cascade Rheumatology Group, Corvallis, OR' },
  { npi: '1720456391', name: 'Cascade Physical Therapy', address: '410 Alder St, Portland, OR' },
  { npi: '1408817225', name: 'Dr. Adaeze Nwosu, MD (Orthopedics)', address: '12 Foothill Medical Building, Beaverton, OR' },
  { npi: '1600113366', name: 'Dr. Farrah Delacroix, MD (Dermatology)', address: '88 Elmcrest Dermatology, Hillsboro, OR' },
];

const cleanTemplates: { dx: string[]; lines: { pos: string; code: string; dxPointer: string; charge: number }[] }[] = [
  { dx: ['Z00.00'], lines: [{ pos: '11', code: '99396', dxPointer: 'A', charge: 255 }] },
  { dx: ['I10'], lines: [{ pos: '11', code: '99213', dxPointer: 'A', charge: 140 }] },
  { dx: ['E11.9'], lines: [{ pos: '11', code: '99214', dxPointer: 'A', charge: 210 }, { pos: '11', code: '83036', dxPointer: 'A', charge: 45 }] },
  { dx: ['E78.5'], lines: [{ pos: '11', code: '99213', dxPointer: 'A', charge: 135 }] },
  { dx: ['M17.11'], lines: [{ pos: '11', code: '97110', dxPointer: 'A', charge: 90 }, { pos: '11', code: '97112', dxPointer: 'A', charge: 70 }] },
  { dx: ['M75.100'], lines: [{ pos: '11', code: '97140', dxPointer: 'A', charge: 65 }, { pos: '11', code: '97110', dxPointer: 'A', charge: 90 }] },
  { dx: ['N39.0'], lines: [{ pos: '11', code: '99213', dxPointer: 'A', charge: 130 }, { pos: '11', code: '81003', dxPointer: 'A', charge: 18 }] },
  { dx: ['J01.90'], lines: [{ pos: '11', code: '99213', dxPointer: 'A', charge: 120 }] },
  { dx: ['L82.1'], lines: [{ pos: '11', code: '11100', dxPointer: 'A', charge: 180 }] },
  { dx: ['H40.11X1'], lines: [{ pos: '11', code: '92014', dxPointer: 'A', charge: 160 }] },
  { dx: ['Z01.419'], lines: [{ pos: '11', code: '99395', dxPointer: 'A', charge: 240 }] },
  { dx: ['F41.1'], lines: [{ pos: '11', code: '90834', dxPointer: 'A', charge: 150 }] },
  { dx: ['I25.10'], lines: [{ pos: '11', code: '99214', dxPointer: 'A', charge: 210 }, { pos: '11', code: '93000', dxPointer: 'A', charge: 95 }] },
  { dx: ['J45.909'], lines: [{ pos: '11', code: '99213', dxPointer: 'A', charge: 150 }, { pos: '11', code: '94010', dxPointer: 'A', charge: 85 }] },
  { dx: ['K21.9'], lines: [{ pos: '11', code: '99213', dxPointer: 'A', charge: 130 }] },
  { dx: ['N18.3'], lines: [{ pos: '11', code: '99214', dxPointer: 'A', charge: 190 }] },
  { dx: ['M06.9'], lines: [{ pos: '11', code: '99214', dxPointer: 'A', charge: 190 }, { pos: '11', code: '96372', dxPointer: 'A', charge: 60 }] },
  { dx: ['J32.9'], lines: [{ pos: '11', code: '99213', dxPointer: 'A', charge: 140 }, { pos: '11', code: '31231', dxPointer: 'A', charge: 180 }] },
  { dx: ['E03.9'], lines: [{ pos: '11', code: '99213', dxPointer: 'A', charge: 130 }, { pos: '11', code: '84443', dxPointer: 'A', charge: 40 }] },
  { dx: ['F32.1'], lines: [{ pos: '11', code: '99214', dxPointer: 'A', charge: 175 }] },
  { dx: ['M54.50'], lines: [{ pos: '11', code: '97110', dxPointer: 'A', charge: 95 }, { pos: '11', code: '97140', dxPointer: 'A', charge: 60 }] },
  { dx: ['M25.561'], lines: [{ pos: '11', code: '99213', dxPointer: 'A', charge: 135 }] },
  { dx: ['H66.90'], lines: [{ pos: '11', code: '99213', dxPointer: 'A', charge: 125 }] },
  { dx: ['R51.9'], lines: [{ pos: '11', code: '99213', dxPointer: 'A', charge: 130 }] },
  { dx: ['M79.1'], lines: [{ pos: '11', code: '97140', dxPointer: 'A', charge: 65 }] },
  { dx: ['Z79.899'], lines: [{ pos: '11', code: '99213', dxPointer: 'A', charge: 120 }, { pos: '11', code: '80053', dxPointer: 'A', charge: 55 }] },
  { dx: ['I48.91'], lines: [{ pos: '11', code: '99214', dxPointer: 'A', charge: 210 }, { pos: '11', code: '93005', dxPointer: 'A', charge: 90 }] },
  { dx: ['G47.33'], lines: [{ pos: '11', code: '99214', dxPointer: 'A', charge: 190 }] },
  { dx: ['M47.816'], lines: [{ pos: '11', code: '99213', dxPointer: 'A', charge: 135 }, { pos: '11', code: '97110', dxPointer: 'A', charge: 90 }, { pos: '11', code: '97035', dxPointer: 'A', charge: 45 }] },
  { dx: ['K57.30'], lines: [{ pos: '11', code: '99214', dxPointer: 'A', charge: 190 }] },
];

// Patients for the 52 standalone clean claims: name, dob, sex, deductible.
// Age-skewed 25-80 toward >50, gender ~even, 4 NB patients under 50, last
// names spanning Caucasian, South Asian, East Asian, Hispanic, "all-American."
const cleanStandalonePatients: [string, string, Patient['sex'], number][] = [
  ['Alex Kim', '1998-04-12', 'NB', 500],
  ['Jordan Reyes', '2001-09-03', 'NB', 500],
  ['Robin Chowdhury', '1993-02-27', 'NB', 500],
  ['Casey Marroquin', '1988-11-15', 'NB', 500],
  ['Priyanka Iyer', '1996-06-08', 'F', 500],
  ['Arjun Bhatt', '1994-08-21', 'M', 500],
  ['Mateo Salazar', '1992-01-30', 'M', 500],
  ['Isabela Cordova', '1990-05-17', 'F', 500],
  ['Julian Griffin', '1989-03-24', 'M', 500],
  ['Charlotte Sullivan', '1991-07-19', 'F', 500],
  ['Takeshi Ueda', '1987-10-05', 'M', 500],
  ['Yuki Tanaka', '1985-12-11', 'F', 500],
  ['Omar Hassan', '1983-02-14', 'M', 500],
  ['Noor Chowdhury', '1982-09-28', 'F', 500],
  ['Felix Anderson', '1980-06-02', 'M', 500],
  ['Vivian Zhao', '1979-04-09', 'F', 500],
  ['Rafael Ochoa', '1978-11-23', 'M', 500],
  ['Paulina Villareal', '1977-01-16', 'F', 500],
  ['Curtis Thompson', '1976-08-30', 'M', 500],
  ['Ingrid Larsen', '1975-05-22', 'F', 500],
  ['Samuel Whitmore', '1974-03-07', 'M', 500],
  ['Eleanor Bennett', '1973-12-19', 'F', 500],
  ['Ravi Menon', '1972-07-14', 'M', 500],
  ['Hana Kwon', '1971-10-27', 'F', 500],
  ['Douglas Callahan', '1970-02-05', 'M', 500],
  ['Josefina Cordova', '1969-06-18', 'F', 500],
  ['Elliot Pierce', '1968-09-11', 'M', 500],
  ['Mei Lin', '1967-04-24', 'F', 500],
  ['Trevor Griffin', '1966-11-06', 'M', 500],
  ['Simone Reyes', '1965-01-29', 'F', 500],
  ['Kenji Matsuda', '1964-08-13', 'M', 500],
  ['Harriet Zhao', '1951-03-27', 'F', 500],
  ['Grant Sullivan', '1950-10-09', 'M', 500],
  ['Denise Menon', '1968-06-02', 'F', 500],
  ['Andre Bennett', '1966-01-15', 'M', 500],
  ['Farrah Chandrasekaran', '1964-08-28', 'F', 500],
  ['Elias Griffin', '1962-04-11', 'M', 500],
  ['Camila Reyes', '1960-11-24', 'F', 500],
  ['Desmond Whitmore', '1958-07-07', 'M', 500],
  ['Rosalind Kwon', '1956-02-19', 'F', 500],
];

cleanStandalonePatients.forEach(([name, dob, sex, ded], i) => {
  const template = cleanTemplates[i % cleanTemplates.length];
  const provider = cmsProviders[i % cmsProviders.length];
  const date = `2026-0${7 + (i % 2)}-${String(10 + (i % 18)).padStart(2, '0')}`;
  claims.push(
    cms({
      id: `CLN-CMS-${String(i + 2).padStart(2, '0')}`,
      patient: pt(name, dob, sex, ded),
      dx: template.dx,
      lines: template.lines.map((l) => ({ ...l, date, npi: provider.npi })),
      billing: provider,
      scenario: 'clean',
      label: 'clean-cms1500',
      note: `Routine visit — in-network, diagnosis and procedure(s) align cleanly, no coverage or documentation issues.`,
    })
  );
});

const cleanUBTemplates: { dx: string; lines: { rev: string; hcpcs?: string; charge: number; units?: number }[] }[] = [
  { dx: 'S91.301A', lines: [{ rev: '0450', hcpcs: '99283', charge: 980 }, { rev: '0270', hcpcs: '12002', charge: 280 }] },
  { dx: 'S52.501A', lines: [{ rev: '0450', hcpcs: '99284', charge: 1200 }, { rev: '0710', hcpcs: '25605', charge: 850 }] },
  { dx: 'M51.36', lines: [{ rev: '0610', hcpcs: '72148', charge: 1800 }] },
  { dx: 'R07.9', lines: [{ rev: '0762', charge: 2400 }] },
  { dx: 'N39.0', lines: [{ rev: '0450', hcpcs: '99282', charge: 820 }] },
  { dx: 'J06.9', lines: [{ rev: '0450', hcpcs: '99282', charge: 640 }, { rev: '0300', charge: 120 }] },
];

const cleanUBFacilities = [
  { name: 'Northgate Emergency Medical Center', npi: '1855023467' },
  { name: 'Eugene Community Hospital', npi: '1244557788' },
];

const cleanUBPatients: [string, string, Patient['sex']][] = [
  ['Marcus Sullivan', '1996-05-14', 'M'],
  ['Tanvi Bhatt', '2000-02-08', 'F'],
  ['Kwan Ha', '1993-09-19', 'M'],
  ['Adriana Fuentes', '1985-12-02', 'F'],
  ['Owen Griffin', '1978-06-27', 'M'],
  ['Beatrice Kwon', '1970-10-14', 'F'],
  ['Nathaniel Reyes', '1963-03-08', 'M'],
  ['Margarethe Zhao', '1957-08-21', 'F'],
  ['Ellis Callahan', '2003-01-11', 'M'],
  ['Priya Chowdhury', '1990-07-04', 'F'],
  ['Colton Whitmore', '1982-04-16', 'M'],
  ['Serena Villareal', '1975-11-28', 'F'],
];

cleanUBPatients.forEach(([name, dob, sex], i) => {
  const template = cleanUBTemplates[i % cleanUBTemplates.length];
  const facility = cleanUBFacilities[i % cleanUBFacilities.length];
  const date = `2026-0${7 + (i % 2)}-${String(5 + (i % 22)).padStart(2, '0')}`;
  claims.push(
    ub({
      id: `CLN-UB-${String(i + 2).padStart(2, '0')}`,
      patient: pt(name, dob, sex, 500),
      tob: '131',
      period: { from: date, through: date },
      lines: template.lines.map((l) => ({ ...l, date })),
      principalDx: template.dx,
      attendingNpi: facility.npi,
      billingName: facility.name,
      billingNpi: facility.npi,
      scenario: 'clean',
      label: 'clean-ub04',
      note: 'Straightforward encounter, no coordination-of-benefits or coding issues.',
    })
  );
});

interface ComboRecipe {
  dx: string;
  surgeonCode: string;
  surgeonCharge: number;
  facilityRev: string;
  facilityHcpcs: string;
  facilityCharge: number;
  suppliesCharge: number;
}
const comboRecipes: ComboRecipe[] = [
  { dx: 'H25.11', surgeonCode: '66984', surgeonCharge: 900, facilityRev: '0360', facilityHcpcs: '66984', facilityCharge: 3200, suppliesCharge: 400 },
  { dx: 'Z12.11', surgeonCode: '45385', surgeonCharge: 480, facilityRev: '0750', facilityHcpcs: '45385', facilityCharge: 2400, suppliesCharge: 300 },
  { dx: 'K40.90', surgeonCode: '49505', surgeonCharge: 750, facilityRev: '0360', facilityHcpcs: '49505', facilityCharge: 4100, suppliesCharge: 480 },
  { dx: 'M23.51', surgeonCode: '29881', surgeonCharge: 780, facilityRev: '0360', facilityHcpcs: '29881', facilityCharge: 3600, suppliesCharge: 450 },
  { dx: 'K35.80', surgeonCode: '44970', surgeonCharge: 680, facilityRev: '0360', facilityHcpcs: '44970', facilityCharge: 5200, suppliesCharge: 550 },
  { dx: 'J35.01', surgeonCode: '42820', surgeonCharge: 520, facilityRev: '0360', facilityHcpcs: '42820', facilityCharge: 2900, suppliesCharge: 380 },
  { dx: 'G56.01', surgeonCode: '64721', surgeonCharge: 610, facilityRev: '0360', facilityHcpcs: '64721', facilityCharge: 2100, suppliesCharge: 260 },
  { dx: 'K64.9', surgeonCode: '46260', surgeonCharge: 540, facilityRev: '0360', facilityHcpcs: '46260', facilityCharge: 2600, suppliesCharge: 300 },
];

const comboPatients: [string, string, Patient['sex']][] = [
  ['Ana Reyes', '1971-05-09', 'F'],
  ['Marcus Delacroix', '1959-08-22', 'M'],
  ['Wanda Griffin', '1966-01-14', 'F'],
  ['Kenji Sutherland', '1954-10-27', 'M'],
  ['Rosalind Chowdhury', '1962-04-06', 'F'],
  ['Elias Zhao', '1950-12-18', 'M'],
  ['Simone Villareal', '1968-07-30', 'F'],
  ['Douglas Kwon', '1957-03-12', 'M'],
];

comboRecipes.forEach((recipe, i) => {
  const [name, dob, sex] = comboPatients[i];
  const surgeon = cmsProviders[(i + 3) % cmsProviders.length];
  const date = `2026-07-${String(8 + i).padStart(2, '0')}`;
  const patient = pt(name, dob, sex, 500);
  const aId = `CLN-CMB-${String(i + 2).padStart(2, '0')}A`;
  const bId = `CLN-CMB-${String(i + 2).padStart(2, '0')}B`;
  claims.push(
    cms({
      id: aId,
      linked: bId,
      patient,
      dx: [recipe.dx],
      priorAuth: `PA-${880000 + i * 137}`,
      lines: [{ date, pos: '24', code: recipe.surgeonCode, dxPointer: 'A', charge: recipe.surgeonCharge, npi: surgeon.npi }],
      billing: surgeon,
      scenario: 'clean',
      label: 'clean-combo-professional',
      note: `Surgeon's professional fee for a same-day procedure — linked facility claim is ${bId}. Clean, prior auth on file, matches facility documentation.`,
    }),
    ub({
      id: bId,
      linked: aId,
      patient,
      tob: '131',
      period: { from: date, through: date },
      lines: [
        { date, rev: recipe.facilityRev, hcpcs: recipe.facilityHcpcs, charge: recipe.facilityCharge },
        { date, rev: '0250', charge: recipe.suppliesCharge },
      ],
      principalDx: recipe.dx,
      attendingNpi: surgeon.npi,
      billingName: 'Redwood Ambulatory Surgical Center',
      billingNpi: '1600113322',
      scenario: 'clean',
      label: 'clean-combo-facility',
      note: `Facility fee for the same same-day procedure — linked to ${aId} (surgeon's professional fee). Same patient, same date, clean on both sides.`,
    })
  );
});

// ===========================================================================
// Write output
// ===========================================================================

const seedPath = path.join(ROOT, 'claims-seed-data.json');
const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as { claims: Claim[] };
seedData.claims.push(...claims);
fs.writeFileSync(seedPath, JSON.stringify(seedData, null, 2) + '\n');

const accumPath = path.join(ROOT, 'member-accumulators.json');
const accumData = JSON.parse(fs.readFileSync(accumPath, 'utf-8')) as { members: MemberAccum[] };
accumData.members.push(...newMembers);
fs.writeFileSync(accumPath, JSON.stringify(accumData, null, 2) + '\n');

console.log(`Wrote ${claims.length} new claims (expected 103) and ${newMembers.length} new member-accumulator entries (expected 87).`);
const counts: Record<string, number> = {};
claims.forEach((c) => { counts[c._testMeta.scenario] = (counts[c._testMeta.scenario] || 0) + 1; });
console.log('New-claim scenario counts:', counts);
