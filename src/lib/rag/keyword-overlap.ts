// Lightweight lexical signal to blend with embedding similarity — "hybrid
// search," the standard mitigation for a real, well-documented weakness of
// pure embedding retrieval: mean-pooling dilutes a long chunk's vector
// toward its average content, so a short, keyword-dense chunk can out-rank
// a longer chunk that actually contains the answer. Discovered via the
// Phase 4 smoke test (see chunk.ts and build-log.html) — bumping top-k or
// flattening markdown only partially addressed it; this targets the actual
// mechanism.

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'what', 'when', 'where', 'who', 'how', 'why', 'does', 'do', 'did',
  'for', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'not', 'no',
  'this', 'that', 'these', 'those', 'it', 'its', 'as', 'with', 'by',
]);

function significantTerms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

/** Fraction of the query's significant terms that also appear in the chunk text. */
export function keywordOverlap(query: string, chunkText: string): number {
  const queryTerms = significantTerms(query);
  if (queryTerms.size === 0) return 0;
  const chunkTerms = significantTerms(chunkText);
  let matches = 0;
  queryTerms.forEach((term) => {
    if (chunkTerms.has(term)) matches++;
  });
  return matches / queryTerms.size;
}
