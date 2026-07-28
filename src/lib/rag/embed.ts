// Wraps @huggingface/transformers' feature-extraction pipeline. The model
// downloads once on first use and caches locally on disk afterward — real
// one-time latency (a few seconds), not a per-query cost. Server-side only;
// never import this from client code.

import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL_ID) as Promise<FeatureExtractionPipeline>;
  }
  return extractorPromise;
}

/** Embeds one or more strings, returning one 384-dim vector per input. */
export async function embed(texts: string[]): Promise<number[][]> {
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: 'mean', normalize: true });
  return output.tolist() as number[][];
}

export async function embedOne(text: string): Promise<number[]> {
  const [vector] = await embed([text]);
  return vector;
}
