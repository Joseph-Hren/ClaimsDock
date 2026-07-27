// Initial status derivation — project-spec.txt Section 1: "Initial status
// (flagged vs. clean) is likewise derived from whether Call 1's evidence is
// non-empty, not separately judged." Wired up for real once Phase 5 (the
// Evaluation Pipeline) exists; testable now against a plain evidence count.

export type InitialStatus = 'Submitted, no flags' | 'Submitted, flagged';

export function deriveInitialStatus(evidenceCount: number): InitialStatus {
  return evidenceCount > 0 ? 'Submitted, flagged' : 'Submitted, no flags';
}
