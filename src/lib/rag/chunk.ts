// Splits each corpus document into chunks along its own `##` heading
// boundaries — those seams were deliberately placed in Phase 2 for exactly
// this. Pure string logic, no model involved, so it's fast to test directly.

import { readFileSync } from 'fs';
import { join } from 'path';
import { CORPORA, type CorpusEntry } from '../../../content/corpora/manifest';
import { flattenForEmbedding } from './flatten-for-embedding';

export interface Chunk {
  id: string; // `${corpusId}#${headingSlug}`
  corpusId: CorpusEntry['id'];
  corpusTitle: string;
  heading: string;
  text: string; // original markdown — what gets cited/displayed
  embeddingText: string; // flattened plain-language version — what gets embedded
}

function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Splits a single markdown document's body into heading-bounded chunks. */
export function chunkMarkdown(corpus: CorpusEntry, markdown: string): Chunk[] {
  const lines = markdown.split('\n');
  const titleLine = lines.find((l) => l.startsWith('# '));
  const title = titleLine ? titleLine.replace(/^# /, '').trim() : corpus.title;

  const chunks: Chunk[] = [];
  let currentHeading: string | null = null; // null = still in the pre-heading front matter
  let currentLines: string[] = [];

  function flush() {
    const text = currentLines.join('\n').trim();
    // The pre-heading front matter is just the "**Source:** ..." provenance
    // blurb — already captured structurally in manifest.ts's citation field.
    // Indexing it as a retrievable chunk was actively harmful (see Phase 4
    // build-log entry): short, keyword-dense provenance text out-competed
    // the actual answer content via mean-pooling dilution on longer chunks.
    if (currentHeading !== null && text.length > 0) {
      chunks.push({
        id: `${corpus.id}#${slugify(currentHeading)}`,
        corpusId: corpus.id,
        corpusTitle: title,
        heading: currentHeading,
        text,
        embeddingText: flattenForEmbedding(text),
      });
    }
    currentLines = [];
  }

  for (const line of lines) {
    if (line.startsWith('# ')) continue; // the H1 title itself isn't chunk content
    if (line.startsWith('## ')) {
      flush();
      currentHeading = line.replace(/^## /, '').trim();
      continue;
    }
    currentLines.push(line);
  }
  flush();

  return chunks;
}

/** Loads and chunks all three corpora listed in the manifest. */
export function chunkAllCorpora(): Chunk[] {
  const corporaDir = join(__dirname, '..', '..', '..', 'content', 'corpora');
  return CORPORA.flatMap((corpus) => {
    const markdown = readFileSync(join(corporaDir, corpus.file), 'utf8');
    return chunkMarkdown(corpus, markdown);
  });
}
