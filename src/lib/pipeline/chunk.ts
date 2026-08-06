// Phase 13 Pass G — claims (and, for Call 2, reconciled Call 1 results) are
// grouped by category and distributed round-robin across a fixed number of
// chunks, so every chunk gets a roughly even mix of every category, rather
// than whichever claims happen to sit next to each other in
// claims-seed-data.json's own file order. Confirmed live (2026-08-06) that
// leaving distribution to file order produced real per-chunk token variance
// (Call 1 ranged 3,832-5,530 completion tokens across 6 chunks) purely
// because clean claims cluster at the end of the authored file — an even
// split makes per-chunk usage predictable, which is what actually lets a
// tighter maxTokens ceiling be set with real confidence. (Not to be confused
// with saving money — total real token spend across the whole run is the
// same either way; see build CLAUDE.md's Pass G entry.)
//
// A first version of this balanced only a binary clean/non-clean split —
// confirmed live to make Call 2's variance much better (spread 1,782 ->
// 665 tokens) but Call 1's WORSE (3,832-5,530 -> 3,716-6,996), because
// fraud/complex-math/ambiguous/missing-data claims stayed clustered in their
// original file order within the "non-clean" bucket, and a plain
// `i % numChunks` round-robin over that clustered order repeatedly landed
// the same expensive category (fraud, the costliest to reason about) in the
// same handful of chunks.
//
// A second version distributed each distinct category independently — still
// wrong, confirmed live to make Call 1's spread even WORSE (3,023-8,322):
// every category's round-robin started at chunk index 0, so each category's
// own remainder unit landed on the same low-index chunks, compounding
// across all five categories instead of canceling out.
//
// A third version interleaved across categories (one from each, cycling)
// before round-robining the result — caught in a unit test before it ever
// reached a live call: when two categories happen to be equal-sized and
// that size evenly divides the chunk count (e.g. 6 fraud + 6 complex-math
// claims into 6 chunks), the interleaved sequence's own period aligns with
// the chunk count's period, producing alternating all-fraud/all-complex-math
// chunks — better in aggregate size, but exactly the per-chunk category
// clustering this whole mechanism exists to prevent.
//
// Fixed with the simplest option, which turns out to be correct: concatenate
// every category's items in order (not interleaved) and round-robin a
// SINGLE continuous cursor across the whole concatenation, never resetting
// between categories. Each category's own remainder starts wherever the
// previous category's count happened to leave the cursor — no two
// categories share the same starting offset unless their sizes coincide
// exactly, and any category at least as large as numChunks completes one
// full cursor cycle before finishing, guaranteeing every chunk gets at
// least one.
//
// Linked claim pairs (a CMS-1500 + UB-04 record for the same encounter)
// MUST land in the same chunk together — Call 1's own prompt (format-
// claim.ts) embeds a linked claim's full data by looking it up in whatever
// claim array was passed to that specific chunk's runAnalysis() call.
// Splitting a pair across two chunks wouldn't error or fail completeness —
// it would silently drop the <linked_claim> block for whichever half's
// partner is missing, breaking the exact documentation-mismatch/day-cap
// cross-referencing several fraud and complex-math scenarios depend on, with
// no visible symptom besides a quietly worse category judgment.
// distributeClaimsForAnalysis groups pairs into single units before
// distributing, specifically to close that off.

import type { GeneratedClaim } from '../claims/types';

/**
 * Round-robin distributes items into `numChunks` groups so each distinct
 * category (whatever getCategory returns) spreads evenly across every
 * chunk, independently of every other category — not just a clean/non-clean
 * binary, which left same-category items clustered together within the
 * "non-clean" side. Generic over T (used for both raw claims pre-Call-1 and
 * reconciled Call-1 results pre-Call-2) so this file doesn't need to import
 * orchestrator.ts's own result type and create a circular dependency.
 */
export function distributeEvenlyByCategory<T>(items: T[], numChunks: number, getCategory: (item: T) => string): T[][] {
  if (numChunks <= 0) throw new Error(`distributeEvenlyByCategory: numChunks must be positive, got ${numChunks}`);

  const byCategory = new Map<string, T[]>();
  for (const item of items) {
    const category = getCategory(item);
    const group = byCategory.get(category);
    if (group) group.push(item);
    else byCategory.set(category, [item]);
  }

  const chunks: T[][] = Array.from({ length: numChunks }, () => []);
  let cursor = 0;
  for (const group of byCategory.values()) {
    for (const item of group) {
      chunks[cursor % numChunks].push(item);
      cursor++;
    }
  }
  return chunks;
}

/**
 * Call 1's own distribution: groups linked pairs into a single unit first
 * (see this file's header comment for why that's load-bearing, not
 * cosmetic), buckets by the authored _testMeta.scenario — the full 5-value
 * category, not just clean-vs-not — then flattens each chunk's units back
 * into a plain claim array.
 */
export function distributeClaimsForAnalysis(claims: GeneratedClaim[], numChunks: number): GeneratedClaim[][] {
  const seen = new Set<string>();
  const units: GeneratedClaim[][] = [];

  for (const claim of claims) {
    if (seen.has(claim.claim_id)) continue;
    seen.add(claim.claim_id);

    const partner = claim.linked_claim_id ? claims.find((c) => c.claim_id === claim.linked_claim_id) : undefined;
    if (partner && !seen.has(partner.claim_id)) {
      seen.add(partner.claim_id);
      units.push([claim, partner]);
    } else {
      units.push([claim]);
    }
  }

  const unitChunks = distributeEvenlyByCategory(units, numChunks, (unit) => unit[0]._testMeta.scenario);
  return unitChunks.map((chunkUnits) => chunkUnits.flat());
}
