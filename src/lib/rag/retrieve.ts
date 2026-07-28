// The actual retrieval function — chunk the corpora, embed every chunk once,
// hold the result in a plain in-memory array for the process lifetime, and
// answer queries by embedding the question and ranking chunks by cosine
// similarity. No hosted vector database; not warranted at this chunk count.

import { chunkAllCorpora, type Chunk } from './chunk';
import { embed, embedOne } from './embed';
import { cosineSimilarity, topK } from './similarity';
import { keywordOverlap } from './keyword-overlap';

// Hybrid-search blend: embedding similarity captures meaning, keyword overlap
// corrects for mean-pooling's length bias (see keyword-overlap.ts). Weights
// chosen so semantic similarity still leads, with lexical overlap as a
// real but secondary signal — not tuned exhaustively, revisit if retrieval
// quality issues show up against real corpus growth later.
const SEMANTIC_WEIGHT = 0.7;
const KEYWORD_WEIGHT = 0.3;

export interface RetrievedChunk extends Chunk {
  score: number;
}

interface IndexedChunk extends Chunk {
  embedding: number[];
}

let indexPromise: Promise<IndexedChunk[]> | null = null;

async function getIndex(): Promise<IndexedChunk[]> {
  if (!indexPromise) {
    indexPromise = (async () => {
      const chunks = chunkAllCorpora();
      const embeddings = await embed(chunks.map((c) => c.embeddingText));
      return chunks.map((chunk, i) => ({ ...chunk, embedding: embeddings[i] }));
    })();
  }
  return indexPromise;
}

export async function retrieve(query: string, k = 4): Promise<RetrievedChunk[]> {
  const index = await getIndex();
  const queryVector = await embedOne(query);
  const scores = index.map((chunk) => {
    const semantic = cosineSimilarity(queryVector, chunk.embedding);
    const lexical = keywordOverlap(query, chunk.embeddingText);
    return SEMANTIC_WEIGHT * semantic + KEYWORD_WEIGHT * lexical;
  });
  return topK(index, scores, k).map(({ item, score }) => ({ ...item, score }));
}
