// Pure Fisher-Yates shuffle, order only — the loading screen's fact cycling
// itself is CSS-only now (see loading.tsx), so this file's only remaining
// job is picking which order the facts render in. `randomFn` is injectable
// so the shuffle stays deterministically testable.
export function shuffledOrder(count: number, randomFn: () => number = Math.random): number[] {
  const arr = Array.from({ length: count }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
