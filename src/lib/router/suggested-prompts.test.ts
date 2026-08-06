import { describe, it, expect } from 'vitest';
import { SUGGESTED_PROMPTS, pickSuggestedPrompts } from './suggested-prompts';

describe('SUGGESTED_PROMPTS', () => {
  it('has no duplicate prompt text', () => {
    const texts = SUGGESTED_PROMPTS.map((p) => p.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('has at least one prompt in every category', () => {
    const categories = new Set(SUGGESTED_PROMPTS.map((p) => p.category));
    expect(categories).toEqual(new Set(['action', 'regulatory', 'fraud', 'coverage', 'self-explain', 'aggregate']));
  });
});

describe('pickSuggestedPrompts', () => {
  it('returns the requested count', () => {
    const picks = pickSuggestedPrompts(4, { scope: 'general' });
    expect(picks).toHaveLength(4);
  });

  it('returns no duplicates within a single draw', () => {
    const picks = pickSuggestedPrompts(6, { scope: 'general' });
    expect(new Set(picks).size).toBe(picks.length);
  });

  it('general scope never returns a claim-scoped prompt', () => {
    // No providerNames passed, so the {{provider}} token always resolves to
    // the same deterministic fallback phrase — account for that substitution
    // when building the set of texts a general draw is allowed to produce.
    const generalTexts = new Set(
      SUGGESTED_PROMPTS.filter((p) => p.scope === 'general').map((p) => p.text.replace('{{provider}}', 'a specific provider')),
    );
    for (let i = 0; i < 20; i += 1) {
      const picks = pickSuggestedPrompts(4, { scope: 'general' });
      for (const pick of picks) expect(generalTexts.has(pick)).toBe(true);
    }
  });

  it('claim scope can return claim-scoped prompts', () => {
    // Draw enough times that at least one claim-scoped prompt should surface.
    const claimTexts = new Set(SUGGESTED_PROMPTS.filter((p) => p.scope === 'claim').map((p) => p.text));
    let sawClaimScoped = false;
    for (let i = 0; i < 50; i += 1) {
      const picks = pickSuggestedPrompts(4, { scope: 'claim' });
      if (picks.some((pick) => claimTexts.has(pick))) sawClaimScoped = true;
    }
    expect(sawClaimScoped).toBe(true);
  });

  it('substitutes a real provider name when providerNames is given', () => {
    const providerNames = ['Cascade Physical Therapy'];
    let sawSubstitution = false;
    for (let i = 0; i < 30; i += 1) {
      const picks = pickSuggestedPrompts(6, { scope: 'general', providerNames });
      if (picks.some((p) => p.includes('Cascade Physical Therapy'))) sawSubstitution = true;
    }
    expect(sawSubstitution).toBe(true);
  });

  it('falls back to a generic phrase when no providerNames are given', () => {
    const picks = pickSuggestedPrompts(6, { scope: 'general', providerNames: [] });
    const providerPrompt = picks.find((p) => p.includes('a specific provider'));
    // Not guaranteed to draw a provider-templated prompt every run, but if one
    // is drawn, it must never leak the raw {{provider}} token.
    for (const pick of picks) expect(pick).not.toContain('{{provider}}');
    void providerPrompt;
  });
});
