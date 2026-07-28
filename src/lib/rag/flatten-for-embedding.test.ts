import { describe, it, expect } from 'vitest';
import { flattenForEmbedding } from './flatten-for-embedding';

describe('flattenForEmbedding', () => {
  it('converts a markdown table into plain-language sentences', () => {
    const input = `Some intro.

| Tier | Deadline |
|---|---|
| Urgent | 72 hours |
| Standard | 30 days |
`;
    const out = flattenForEmbedding(input);
    expect(out).not.toContain('|');
    expect(out).toContain('Tier: Urgent; Deadline: 72 hours.');
    expect(out).toContain('Tier: Standard; Deadline: 30 days.');
    expect(out).toContain('Some intro.');
  });

  it('strips bold/italic markers, inline code, and link syntax', () => {
    const out = flattenForEmbedding('This is **bold** and `code` and a [link](https://example.com).');
    expect(out).toBe('This is bold and code and a link.');
  });

  it('leaves plain prose with no table untouched aside from markup stripping', () => {
    const input = 'Just a plain paragraph with no special syntax at all.';
    expect(flattenForEmbedding(input)).toBe(input);
  });

  it('handles a chunk with no table gracefully', () => {
    expect(() => flattenForEmbedding('No pipes here.')).not.toThrow();
  });
});
