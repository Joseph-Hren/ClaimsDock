// Hand-curated ICD-10 diagnosis-code -> short plain-English label lookup —
// companion to code-descriptions.ts (procedure/revenue codes). Combined on
// the Claims Card so each line carries real context, e.g. "Office visit —
// right knee pain" instead of just "Office visit": a generic E/M code like
// 99213 is used for any complaint, so the "what was this actually for" part
// of the story only ever lived in the diagnosis, never in the procedure
// code alone. Found live 2026-08-06 when the procedure-only label made a
// physical-therapy claim unreadable without cross-checking Evidence.
//
// Same discipline as code-descriptions.ts: hand-curated, scoped to exactly
// the ICD-10 codes this seed set uses, not general ICD-10 coverage.

export const DIAGNOSIS_DESCRIPTIONS: Record<string, string> = {
  'D22.5': 'mole, trunk',
  'D22.9': 'mole',
  'E03.9': 'hypothyroidism',
  'E04.1': 'thyroid nodule',
  'E11.9': 'type 2 diabetes',
  'E78.5': 'high cholesterol',
  'F32.1': 'moderate depression',
  'F41.1': 'generalized anxiety',
  'G47.33': 'sleep apnea',
  'G56.01': 'carpal tunnel syndrome',
  'H25.11': 'cataract',
  'H40.11X1': 'glaucoma',
  'H66.90': 'ear infection',
  'I10': 'hypertension',
  'I21.4': 'heart attack',
  'I25.10': 'coronary artery disease',
  'I48.91': 'atrial fibrillation',
  'J00': 'common cold',
  'J01.90': 'acute sinusitis',
  'J06.9': 'upper respiratory infection',
  'J18.9': 'pneumonia',
  'J32.9': 'chronic sinusitis',
  'J35.01': 'chronic tonsillitis',
  'J44.1': 'COPD exacerbation',
  'J45.909': 'asthma',
  'K21.9': 'acid reflux',
  'K35.80': 'acute appendicitis',
  'K40.90': 'inguinal hernia',
  'K57.30': 'diverticulosis',
  'K64.9': 'hemorrhoids',
  'K80.20': 'gallstones',
  'L02.91': 'skin abscess',
  'L03.115': 'cellulitis, right arm',
  'L57.0': 'sun-damaged skin',
  'L82.1': 'benign skin growth',
  'M06.9': 'rheumatoid arthritis',
  'M17.11': 'right knee osteoarthritis',
  'M23.51': 'right knee meniscus tear',
  'M25.561': 'right knee pain',
  'M47.816': 'lumbar spinal arthritis',
  'M48.062': 'lumbar spinal stenosis',
  'M51.36': 'lumbar disc degeneration',
  'M54.50': 'low back pain',
  'M75.100': 'rotator cuff tear',
  'M75.101': 'right rotator cuff tear',
  'M79.1': 'muscle pain',
  'M79.601': 'right arm pain',
  'M79.604': 'right leg pain',
  'N10': 'kidney infection',
  'N18.3': 'stage 3 kidney disease',
  'N18.4': 'stage 4 kidney disease',
  'N39.0': 'urinary tract infection',
  'R05.9': 'cough',
  'R07.9': 'chest pain',
  'R10.9': 'abdominal pain',
  'R51.9': 'headache',
  'S52.501A': 'wrist fracture',
  'S61.409A': 'hand laceration',
  'S72.001A': 'hip fracture',
  'S82.001A': 'tibia fracture',
  'S91.301A': 'foot wound',
  'S93.401A': 'ankle sprain',
  'Z00.00': 'routine physical',
  'Z01.419': 'routine gynecological exam',
  'Z12.11': 'colorectal cancer screening',
  'Z79.899': 'long-term medication monitoring',
};

/** Bare code if nothing's mapped — never an empty/undefined label. */
export function describeDiagnosis(code: string | null | undefined): string | null {
  if (!code) return null;
  return DIAGNOSIS_DESCRIPTIONS[code] ?? null;
}

/**
 * Resolves a CMS-1500 service line's box24e_diagnosis_pointer (e.g. "A" or
 * "A,B") against the claim's own box21_diagnoses array and returns the
 * PRIMARY (first-referenced) diagnosis's plain-English label — showing
 * every pointed-to diagnosis would make an already-lengthening line longer
 * still, and the primary one carries the real "what was this for" context.
 */
export function primaryDiagnosisLabel(pointer: string, diagnoses: string[]): string | null {
  const firstLetter = pointer.trim().charAt(0);
  const index = firstLetter.charCodeAt(0) - 'A'.charCodeAt(0);
  const code = diagnoses[index];
  return describeDiagnosis(code);
}
