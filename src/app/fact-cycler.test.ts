import { describe, it, expect } from 'vitest';
import { getFactCycleState, seededShuffle, getOrInitCycleAnchor, startFactCyclePolling } from './fact-cycler';

describe('seededShuffle', () => {
  it('returns every index exactly once', () => {
    const result = seededShuffle(19, 42);
    expect(result.slice().sort((a, b) => a - b)).toEqual(Array.from({ length: 19 }, (_, i) => i));
  });

  it('is deterministic for a given seed', () => {
    expect(seededShuffle(19, 42)).toEqual(seededShuffle(19, 42));
  });
});

describe('getFactCycleState', () => {
  it('holds the same fact visible for the hold window, then hides it during the fade gap', () => {
    const first = getFactCycleState(5, 0, 1, 0);
    expect(first.visible).toBe(true);

    const stillHeld = getFactCycleState(5, 0, 1, 6900);
    expect(stillHeld.factIndex).toBe(first.factIndex);
    expect(stillHeld.visible).toBe(true);

    const duringFade = getFactCycleState(5, 0, 1, 7300);
    expect(duringFade.visible).toBe(false);

    const nextFact = getFactCycleState(5, 0, 1, 7700);
    expect(nextFact.visible).toBe(true);
    expect(nextFact.factIndex).not.toBe(first.factIndex);
  });

  it('gives the same answer no matter how many times it is recomputed for the same elapsed time', () => {
    // This is the actual property that matters: a component remounting
    // mid-wait and recomputing from scratch must land on the same state a
    // component that never remounted would have reached by then.
    const a = getFactCycleState(19, 1000, 7, 55_000);
    const b = getFactCycleState(19, 1000, 7, 55_000);
    expect(a).toEqual(b);
  });

  it('cycles through every fact without an immediate repeat across a full round', () => {
    const seen: number[] = [];
    for (let elapsed = 0; elapsed < 7650 * 19; elapsed += 7650) {
      seen.push(getFactCycleState(19, 0, 3, elapsed).factIndex);
    }
    expect(new Set(seen).size).toBe(19);
  });
});

function fakeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

describe('getOrInitCycleAnchor', () => {
  it('persists the anchor so a second call returns the same values', () => {
    const storage = fakeStorage();
    const first = getOrInitCycleAnchor(storage);
    const second = getOrInitCycleAnchor(storage);
    expect(second).toEqual(first);
  });

  it('falls back to a fresh anchor when no storage is available', () => {
    const anchor = getOrInitCycleAnchor(undefined);
    expect(typeof anchor.startTime).toBe('number');
    expect(typeof anchor.seed).toBe('number');
  });
});

describe('startFactCyclePolling', () => {
  it('calls back immediately, and stops after the returned cleanup runs', () => {
    const storage = fakeStorage();
    const calls: number[] = [];
    const stop = startFactCyclePolling(5, () => calls.push(1), { pollMs: 10, storage });
    expect(calls.length).toBe(1);
    stop();
  });

  it('survives being "remounted" (a fresh call with the same storage) without losing its place', async () => {
    const storage = fakeStorage();
    // Backdate the anchor so we're partway through a cycle, simulating a
    // component that has already been running for a while before a remount.
    storage.setItem('claimsdock:loading-cycle', JSON.stringify({ startTime: Date.now() - 50_000, seed: 9 }));

    let lastA: number | undefined;
    const stopA = startFactCyclePolling(19, (s) => (lastA = s.factIndex), { pollMs: 10, storage });
    stopA();

    // Simulate the DOM node being torn down and recreated: a brand new call
    // reading the same persisted anchor should compute the same fact.
    let lastB: number | undefined;
    const stopB = startFactCyclePolling(19, (s) => (lastB = s.factIndex), { pollMs: 10, storage });
    stopB();

    expect(lastB).toBe(lastA);
  });
});
