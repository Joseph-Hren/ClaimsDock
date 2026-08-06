// Grounding for the Pipeline's two calls — project-spec.txt Section 2's RAG
// mechanism note: "full-context stuffing" here, not per-query retrieval.
// The three corpora are a few pages total, small enough to hand to the model
// whole; chunked embedding + similarity search (src/lib/rag/) is reserved for
// Anchor/the Router (Phase 6), where it's the actual retrieval mechanism
// being demonstrated. The Pipeline just needs the full reference material
// available every time it reasons about a claim.

import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPORA } from '../../../content/corpora/manifest';

let corpusContext: string | null = null;

export function getFullCorpusContext(): string {
  if (corpusContext === null) {
    // process.cwd(), not __dirname — this code was never actually bundled
    // for a real Next.js route handler before Pass A1 (only exercised via
    // tsx scripts and Vitest, both of which also happen to leave __dirname
    // resolving correctly, masking the difference). Turbopack's bundling for
    // route handlers relocates the compiled chunk, so __dirname no longer
    // points at this file's real directory — process.cwd() is stable across
    // every context this project actually runs in (npm scripts, Vitest,
    // dev/build/start), since Next.js always runs from the project root.
    const corporaDir = join(process.cwd(), 'content', 'corpora');
    corpusContext = CORPORA.map((corpus) => {
      const markdown = readFileSync(join(corporaDir, corpus.file), 'utf8');
      return `<document title="${corpus.title}" source="${corpus.citation}">\n${markdown}\n</document>`;
    }).join('\n\n');
  }
  return corpusContext;
}
