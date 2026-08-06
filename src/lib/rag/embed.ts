// Wraps @huggingface/transformers' feature-extraction pipeline. The model
// downloads once on first use and caches locally on disk afterward — real
// one-time latency (a few seconds), not a per-query cost. Server-side only;
// never import this from client code.

import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';

// Default cache directory lives inside node_modules, which is fine
// locally but read-only on Vercel at runtime — found live 2026-08-06 as
// "ENOENT: no such file or directory, mkdir '/var/task/node_modules/
// @huggingface/transformers/.cache'". /tmp is the only writable path in a
// Vercel serverless function, and is exactly what this needs: the model
// just has to survive for one warm instance's lifetime, not permanently.
env.cacheDir = '/tmp/huggingface-cache';

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
