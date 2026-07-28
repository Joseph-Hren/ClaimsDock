import { describe, it, expect } from 'vitest';
import { chunkMarkdown, chunkAllCorpora } from './chunk';
import { CORPORA } from '../../../content/corpora/manifest';

const SAMPLE = `# Sample Doc

Some intro text before any heading.

## First Section

Content of the first section.
More content.

## Second Section

Content of the second section.
`;

describe('chunkMarkdown', () => {
  it('does NOT index the pre-heading front matter as a retrievable chunk', () => {
    // Discovered in the Phase 4 smoke test: this text is just source/provenance
    // blurb, already captured in manifest.ts's citation field. Indexing it
    // as a chunk let it out-rank real answer content (short + keyword-dense
    // beats long + diffuse under mean-pooling) — so it's deliberately dropped.
    const chunks = chunkMarkdown(CORPORA[0], SAMPLE);
    expect(chunks.some((c) => c.text.includes('Some intro text'))).toBe(false);
  });

  it('splits on every ## heading, in order', () => {
    const chunks = chunkMarkdown(CORPORA[0], SAMPLE);
    const headings = chunks.map((c) => c.heading);
    expect(headings).toEqual(['First Section', 'Second Section']);
  });

  it('excludes the H1 title line from chunk content', () => {
    const chunks = chunkMarkdown(CORPORA[0], SAMPLE);
    expect(chunks.some((c) => c.text.includes('Sample Doc'))).toBe(false);
  });

  it('gives every chunk a stable, unique id', () => {
    const chunks = chunkMarkdown(CORPORA[0], SAMPLE);
    const ids = chunks.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('chunkAllCorpora', () => {
  it('produces at least one chunk per corpus in the manifest', () => {
    const chunks = chunkAllCorpora();
    const corporaWithChunks = new Set(chunks.map((c) => c.corpusId));
    CORPORA.forEach((corpus) => expect(corporaWithChunks.has(corpus.id)).toBe(true));
  });

  it('produces a reasonable total chunk count for three short documents', () => {
    const chunks = chunkAllCorpora();
    expect(chunks.length).toBeGreaterThan(10);
    expect(chunks.length).toBeLessThan(30);
  });
});
