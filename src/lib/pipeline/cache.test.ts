import { describe, it, expect, vi, beforeEach } from 'vitest';

const runPipelineMock = vi.fn();
vi.mock('./orchestrator', () => ({
  runPipeline: (...args: unknown[]) => runPipelineMock(...args),
}));

// unstable_cache requires a real Next.js request context (its
// `incrementalCache`) that doesn't exist under bare Vitest — confirmed live,
// it throws "Invariant: incrementalCache missing" without this. Faked here
// as a simple call-through-and-memoize-by-key, the same way runPipeline is
// mocked above: what's actually under test is cache.ts's own isoWeek-keying
// and same-process dedup logic, not Next's own caching internals.
const fakeCacheStore = new Map<string, unknown>();
vi.mock('next/cache', () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[]) =>
    async (...args: unknown[]) => {
      const key = JSON.stringify([keyParts, args]);
      if (fakeCacheStore.has(key)) return fakeCacheStore.get(key);
      const result = await fn(...args);
      fakeCacheStore.set(key, result);
      return result;
    },
}));

// Imported after the mock so it picks up the mocked orchestrator module.
const { getCachedPipelineResults, clearPipelineCache } = await import('./cache');

describe('getCachedPipelineResults', () => {
  beforeEach(() => {
    clearPipelineCache();
    fakeCacheStore.clear();
    runPipelineMock.mockReset();
  });

  it('calls runPipeline once and reuses the result for the same ISO week', async () => {
    runPipelineMock.mockResolvedValue([{ claim_id: 'A' }]);
    const monday = new Date('2026-07-20T09:00:00Z');
    const friday = new Date('2026-07-24T18:00:00Z');

    const first = await getCachedPipelineResults(monday);
    const second = await getCachedPipelineResults(friday);

    expect(runPipelineMock).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('recomputes when the ISO week changes', async () => {
    runPipelineMock.mockResolvedValueOnce([{ claim_id: 'week30' }]).mockResolvedValueOnce([{ claim_id: 'week31' }]);

    const week30 = await getCachedPipelineResults(new Date('2026-07-20T09:00:00Z'));
    const week31 = await getCachedPipelineResults(new Date('2026-07-27T09:00:00Z'));

    expect(runPipelineMock).toHaveBeenCalledTimes(2);
    expect(week30).not.toBe(week31);
  });

  it('shares one in-flight call across concurrent requests for an uncached week', async () => {
    let resolvePipeline!: (v: unknown) => void;
    runPipelineMock.mockReturnValue(new Promise((resolve) => (resolvePipeline = resolve)));

    const now = new Date('2026-07-20T09:00:00Z');
    const callA = getCachedPipelineResults(now);
    const callB = getCachedPipelineResults(now);

    resolvePipeline([{ claim_id: 'concurrent' }]);
    const [a, b] = await Promise.all([callA, callB]);

    expect(runPipelineMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });
});
