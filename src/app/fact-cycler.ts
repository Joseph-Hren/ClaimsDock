const HOLD_MS = 7000;
const FADE_MS = 650;
const TOTAL_MS = HOLD_MS + FADE_MS;

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(count: number, seed: number): number[] {
  const rand = mulberry32(seed);
  const arr = Array.from({ length: count }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface FactCycleState {
  factIndex: number;
  visible: boolean;
}

// Derives the current fact and fade phase purely from elapsed wall-clock
// time since a persisted start timestamp, rather than an in-memory chain of
// setTimeout calls. Found necessary 2026-08-06 after repeated live reports
// (a long-running dev session, and separately a fresh production deploy
// under a genuine ~90s cold Pipeline run) of the fact text staying frozen
// on the very first entry the whole time. A Suspense fallback held for that
// long during a streamed SSR response is exactly the scenario most likely
// to have its DOM node torn down and recreated mid-wait by the browser or
// an intermediary proxy — deriving state from elapsed time (persisted in
// sessionStorage) makes the displayed fact self-correcting regardless of
// how many times that happens, instead of depending on one unbroken timer
// chain surviving the entire wait.
export function getFactCycleState(factCount: number, startTime: number, seed: number, now: number): FactCycleState {
  const elapsed = Math.max(0, now - startTime);
  const cycleNumber = Math.floor(elapsed / TOTAL_MS);
  const phase = elapsed % TOTAL_MS;
  const round = Math.floor(cycleNumber / factCount);
  const posInRound = cycleNumber % factCount;
  const order = seededShuffle(factCount, seed + round);
  return {
    factIndex: order[posInRound],
    visible: phase < HOLD_MS,
  };
}

const STORAGE_KEY = 'claimsdock:loading-cycle';

export function getOrInitCycleAnchor(storage: Storage | undefined): { startTime: number; seed: number } {
  if (!storage) return { startTime: Date.now(), seed: 1 };
  try {
    const stored = storage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed.startTime === 'number' && typeof parsed.seed === 'number') return parsed;
    }
  } catch {
    // sessionStorage unavailable or corrupt — fall through to a fresh anchor.
  }
  const anchor = { startTime: Date.now(), seed: Math.floor(Math.random() * 2 ** 31) };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(anchor));
  } catch {
    // Ignore — the anchor still works for this mount, it just won't survive a remount.
  }
  return anchor;
}

export function startFactCyclePolling(
  factCount: number,
  onTick: (state: FactCycleState) => void,
  options: { pollMs?: number; storage?: Storage } = {},
): () => void {
  const pollMs = options.pollMs ?? 250;
  const storage = options.storage ?? (typeof window !== 'undefined' ? window.sessionStorage : undefined);
  const { startTime, seed } = getOrInitCycleAnchor(storage);
  let lastKey = '';

  function tick() {
    const state = getFactCycleState(factCount, startTime, seed, Date.now());
    const key = `${state.factIndex}:${state.visible}`;
    if (key !== lastKey) {
      lastKey = key;
      onTick(state);
    }
  }

  tick();
  const intervalId = setInterval(tick, pollMs);
  return () => clearInterval(intervalId);
}
