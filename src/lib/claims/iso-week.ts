// Shared ISO-week keying — project-spec.txt Section 11. Originally private
// to generate-claims.ts; extracted in Phase 7 so the Pipeline's per-week
// cache (src/lib/pipeline/cache.ts) keys itself the same way the claim
// seed generator already does, rather than reimplementing the algorithm.

export function getISOWeekKey(date: Date): number {
  // ISO 8601 week number, Thursday-anchored — standard algorithm.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  // Fold ISO year + week into a single numeric key (e.g. 2026-W30 -> 202630).
  return d.getUTCFullYear() * 100 + weekNum;
}
