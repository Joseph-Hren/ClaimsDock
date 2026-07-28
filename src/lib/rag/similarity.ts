// Cosine similarity — pure math, no model dependency, so it's testable on its
// own. At our chunk count (a few dozen), comparing a query vector against
// every chunk directly is instant; no approximate-nearest-neighbor index
// is warranted at this scale.

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: vector length mismatch (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function topK<T>(items: T[], scores: number[], k: number): { item: T; score: number }[] {
  return items
    .map((item, i) => ({ item, score: scores[i] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
