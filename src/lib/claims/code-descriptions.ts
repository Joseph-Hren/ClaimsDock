// Hand-curated CPT/HCPCS/revenue-code -> short plain-English label lookup,
// shown alongside the raw code on the Claims Card, never replacing it
// (project-spec.txt Open Items, "Procedure-code descriptions on the Claims
// Card," Phase 13 Pass F). Deliberately not a live coding API/dataset —
// consistent with this project's single-external-dependency discipline (see
// Stack, build CLAUDE.md) — and scoped to exactly the codes this seed set
// uses, not general CPT/HCPCS coverage.
//
// Kept to 2-3 words on purpose: these render inline next to the code on a
// line that also carries units and charge, and a wrapped line would grow
// every claim card's height, already tall from a model's own reasoning
// bullets elsewhere on the card. Unmapped codes just fall back to showing
// the bare code (see describeCode) rather than an empty label.

export const CODE_DESCRIPTIONS: Record<string, string> = {
  // CMS-1500 procedure codes (CPT/HCPCS)
  '10060': 'Incision & drainage',
  '10061': 'I&D, complicated',
  '11100': 'Skin biopsy',
  '11401': 'Skin lesion excision',
  '11402': 'Skin lesion excision',
  '11403': 'Skin lesion excision, large',
  '12001': 'Wound repair, simple',
  '12002': 'Wound repair, simple',
  '17000': 'Lesion removal',
  '20605': 'Joint injection',
  '20610': 'Joint injection',
  '20611': 'Joint injection, imaging',
  '25605': 'Wrist fracture care',
  '27245': 'Hip fracture repair',
  '27447': 'Knee replacement',
  '27758': 'Tibia fracture repair',
  '29881': 'Knee arthroscopy',
  '29882': 'Knee arthroscopy, repair',
  '31231': 'Nasal endoscopy',
  '36415': 'Blood draw',
  '42820': 'Tonsillectomy',
  '44970': 'Appendectomy',
  '45385': 'Colonoscopy, polyp removal',
  '46260': 'Hemorrhoidectomy',
  '47562': 'Gallbladder removal',
  '49505': 'Hernia repair',
  '64483': 'Epidural injection',
  '60100': 'Thyroid biopsy',
  '64721': 'Carpal tunnel release',
  '66984': 'Cataract surgery',
  '71046': 'Chest X-ray',
  '72148': 'MRI, spine',
  '80053': 'Metabolic panel (lab)',
  '80061': 'Lipid panel (lab)',
  '81003': 'Urinalysis (lab)',
  '83036': 'HbA1c (lab)',
  '84443': 'Thyroid test (lab)',
  '90834': 'Psychotherapy',
  '92014': 'Eye exam',
  '93000': 'EKG',
  '93005': 'EKG tracing',
  '93458': 'Cardiac catheterization',
  '94010': 'Spirometry',
  '94640': 'Nebulizer treatment',
  '96365': 'IV infusion',
  '96372': 'Injection, therapeutic',
  '96375': 'Injection, additional',
  '97035': 'Ultrasound therapy',
  '97110': 'Therapeutic exercise',
  '97112': 'Neuromuscular re-ed.',
  '97140': 'Manual therapy',
  '99213': 'Office visit',
  '99214': 'Office visit',
  '99215': 'Office visit, complex',
  '99221': 'Initial hospital visit',
  '99222': 'Initial hospital visit',
  '99223': 'Initial hospital visit',
  '99231': 'Hospital follow-up',
  '99232': 'Hospital follow-up',
  '99282': 'ER visit, low',
  '99283': 'ER visit, moderate',
  '99284': 'ER visit, high',
  '99291': 'Critical care',
  '99395': 'Preventive exam',
  '99396': 'Preventive exam',

  // UB-04 revenue codes — used as the fallback display code whenever a
  // revenue line carries no HCPCS code of its own.
  '0120': 'Room & board',
  '0206': 'ICU care',
  '0250': 'Pharmacy',
  '0270': 'Med/surg supplies',
  '0300': 'Lab',
  '0360': 'OR services',
  '0410': 'Respiratory services',
  '0481': 'Cardiac cath lab',
  '0450': 'ER services',
  '0610': 'Imaging',
  '0710': 'Recovery room',
  '0730': 'EKG',
  '0750': 'GI/endoscopy',
  '0762': 'Observation care',
};

/** Bare code if nothing's mapped — never an empty/undefined label on the card. */
export function describeCode(code: string): string | null {
  return CODE_DESCRIPTIONS[code] ?? null;
}

/** "97110 · Therapeutic exercise", or just the code if unmapped. */
export function codeWithDescription(code: string): string {
  const label = describeCode(code);
  return label ? `${code} · ${label}` : code;
}
