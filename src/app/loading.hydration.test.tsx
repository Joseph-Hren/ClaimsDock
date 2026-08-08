// Loading is a plain Server Component now (rewritten 2026-08-07) — no
// client state, no hooks, so there's nothing left to hydrate or remount in
// the way the old useEffect-driven version had. These tests check the
// actual mechanism that replaced it: every fact renders into the markup up
// front, each with a distinct animation-delay, and a shared @keyframes rule
// sized to however many facts actually exist — the whole point being that
// none of this depends on client JS ever running at all.
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import Loading from './loading';

describe('Loading', () => {
  const html = renderToString(<Loading />);

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

  it('defines one shared keyframe, scaled to the actual fact count', () => {
    expect(html).toContain('@keyframes factSlot');
    const stops = [...html.matchAll(/([\d.]+)% \{ opacity: (0|1); \}/g)].map((m) => Number(m[1]));
    // 0%, fade-in-end, fade-out-start, slot-end, 100% — strictly increasing.
    expect(stops.length).toBe(5);
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i]).toBeGreaterThan(stops[i - 1]);
    }
  });

  it('marks the fact carousel decorative, since it is not load-bearing information', () => {
    expect(html).toMatch(/factStack[^>]*aria-hidden="true"|aria-hidden="true"[^>]*factStack/);
  });
});
