const MIN_HOLD_MS = 6000;
const HOLD_RANGE_MS = 2000;
const FADE_MS = 650;

export function shuffledIndices(count: number, randomFn: () => number = Math.random): number[] {
  const arr = Array.from({ length: count }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface FactCyclerCallbacks {
  onFadeOut: () => void;
  onNext: (index: number) => void;
  onFadeIn: () => void;
}

// Extracted from the Loading component so the shuffle/timing logic can be
// verified directly under fake timers, independent of React/hydration —
// found necessary 2026-08-06 after a live report of the fact text getting
// permanently stuck on the first entry, never cycling.
export function startFactCycler(
  factCount: number,
  startIndex: number,
  callbacks: FactCyclerCallbacks,
  randomFn: () => number = Math.random,
): () => void {
  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout>;
  let current = startIndex;
  let queue = shuffledIndices(factCount, randomFn).filter((i) => i !== current);

  function nextFromQueue(): number {
    if (queue.length === 0) {
      const reshuffled = shuffledIndices(factCount, randomFn);
      if (reshuffled.length > 1 && reshuffled[0] === current) {
        [reshuffled[0], reshuffled[1]] = [reshuffled[1], reshuffled[0]];
      }
      queue = reshuffled;
    }
    return queue.shift()!;
  }

  function scheduleNext() {
    const holdMs = MIN_HOLD_MS + randomFn() * HOLD_RANGE_MS;
    timeoutId = setTimeout(() => {
      if (cancelled) return;
      callbacks.onFadeOut();
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        current = nextFromQueue();
        callbacks.onNext(current);
        callbacks.onFadeIn();
        scheduleNext();
      }, FADE_MS);
    }, holdMs);
  }

  scheduleNext();
  return () => {
    cancelled = true;
    clearTimeout(timeoutId);
  };
}
