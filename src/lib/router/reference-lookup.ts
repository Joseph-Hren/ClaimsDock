// Reference Lookup tool dispatch — project-spec.txt Section 1's table:
// general policy/regulatory questions, independent of any specific claim.
// The one tool that actually exercises Phase 4's real chunked retrieval
// (retrieve()) rather than full-context stuffing — the Pipeline uses the
// latter (Phase 5's context.ts) precisely so this is where real retrieval
// gets demonstrated.

import { retrieve } from '../rag/retrieve';

export interface ReferenceChunk {
  source: string;
  heading: string;
  text: string;
}

export async function dispatchReferenceLookup(input: { question: string }): Promise<{ chunks: ReferenceChunk[] }> {
  const results = await retrieve(input.question);
  return {
    chunks: results.map((r) => ({ source: r.corpusTitle, heading: r.heading, text: r.text })),
  };
}
