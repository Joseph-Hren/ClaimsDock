// LoadingScreen has no client state and no hooks (rewritten 2026-08-07,
// moved from app/loading.tsx to here 2026-08-10) — so there's nothing to
// hydrate or remount in the way an old useEffect-driven version had. These
// tests check the mechanism that replaced it: every fact renders into the
// markup up front, each with a distinct animation-delay — the whole point
// being that none of this depends on client JS ever running at all.
//
// The shared @keyframes rule itself is NOT checked here — it's a static
// rule in LoadingScreen.module.css (2026-08-08, after a live regression:
// generating it dynamically and injecting it via a
// <style dangerouslySetInnerHTML> tag produced byte-correct HTML that still
// didn't render visibly in production). A rendered-HTML test can't see
// CSS-module content at all, static or dynamic, so there was never real
// coverage of the keyframe's own correctness here — only of whether it
// existed in the markup, which is exactly the assumption that broke.
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import LoadingScreen from './LoadingScreen';

describe('LoadingScreen', () => {
  const html = renderToString(<LoadingScreen />);

  it('renders every fact into the markup at once, not just one at a time', () => {
    const factItemCount = (html.match(/class="[^"]*factItem[^"]*"/g) ?? []).length;
    expect(factItemCount).toBeGreaterThan(1);
  });

  it('gives each fact a distinct, increasing animation-delay', () => {
    const delays = [...html.matchAll(/animation-delay:([\d.]+)s/g)].map((m) => Number(m[1]));
    expect(delays.length).toBeGreaterThan(1);
    const sorted = [...delays].sort((a, b) => a - b);
    expect(delays).toEqual(sorted);
    expect(new Set(delays).size).toBe(delays.length);
    // Evenly spaced — each item's delay is one more full slot than the last.
    const step = delays[1] - delays[0];
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i] - delays[i - 1]).toBeCloseTo(step, 5);
    }
  });

  it('never injects a dynamic <style> tag — the regression this guards against', () => {
    expect(html).not.toContain('<style');
  });

  it('marks the fact carousel decorative, since it is not load-bearing information', () => {
    expect(html).toMatch(/factStack[^>]*aria-hidden="true"|aria-hidden="true"[^>]*factStack/);
  });
});
