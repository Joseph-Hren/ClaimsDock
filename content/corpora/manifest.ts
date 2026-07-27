// Manifest of the three RAG corpora — project-spec.txt Section 2. Phase 4's
// retrieval layer chunks and embeds each file listed here; this file is just
// the typed index so that phase doesn't have to hardcode file paths and
// citations scattered through its own code.

export interface CorpusEntry {
  id: 'coverage-policy' | 'fraud-indicator-reference' | 'deadline-reference';
  title: string;
  file: string; // relative to content/corpora/
  sourced: boolean; // false = fully synthetic, no real external source
  citation: string;
}

export const CORPORA: CorpusEntry[] = [
  {
    id: 'coverage-policy',
    title: 'Coverage & Adjudication Policy',
    file: 'coverage-policy.md',
    sourced: false,
    citation: 'Fully synthetic, written in-house for ClaimsDock — not sourced from any real insurer contract.',
  },
  {
    id: 'fraud-indicator-reference',
    title: 'Fraud-Indicator Reference',
    file: 'fraud-indicator-reference.md',
    sourced: true,
    citation:
      'FinCEN Advisory FIN-2026-A001 (Mar. 30, 2026) for the volume-spike red flag; NHCAA consumer-information page for the misrepresentation framing; OIG/DOJ/CMS-NCCI enforcement context for the five billing-fraud category names. Independently verified 2026-07-27.',
  },
  {
    id: 'deadline-reference',
    title: 'Regulatory Deadline Reference',
    file: 'deadline-reference.md',
    sourced: true,
    citation:
      '29 CFR 2560.503-1 (ERISA claims-procedure regulation) and DOL/EBSA guidance, verified against eCFR 2026-07-27; state prompt-pay statutes referenced generally.',
  },
];
