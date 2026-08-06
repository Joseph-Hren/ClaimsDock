// One-off spot-check (2026-08-06) — verifying the evidence-field's real
// maxItems: 6 cap (analysis.ts) against the exact claim that surfaced the
// problem live (10 evidence bullets on a documentation-mismatch pair, then
// 13 after a prose-only "hard cap" made it worse). Deliberately NOT
// recheckClaim (reanalyze.ts) — that helper only passes a single claim into
// runAnalysis, so format-claim.ts's linked-claim lookup would find nothing
// and silently drop the cross-reference this scenario depends on. Runs just
// the 2 linked claims directly instead of the full 123-claim set, for a
// cheap, real, correctly-reproduced test. Provider is an explicit CLI arg,
// not just a Kimi default — buildResultSchema (analysis.ts) is shared with
// Claude, and this codebase already has one documented case of Anthropic's
// structured outputs NOT supporting an array-length constraint (see
// batch-retry.ts's own header comment), so maxItems needed checking against
// both providers before trusting it project-wide, not just the one this bug
// happened to surface on. Run via:
//   npx tsx --env-file=.env.local scripts/spot-check-evidence-cap.ts kimi
//   npx tsx --env-file=.env.local scripts/spot-check-evidence-cap.ts anthropic

import { generateClaims, getProviderHistory } from '../src/lib/claims/generate-claims';
import { buildClaimNumberRegistry } from '../src/lib/claims/claim-number';
import { runAnalysis } from '../src/lib/pipeline/analysis';
import type { ModelProvider } from '../src/lib/pipeline/model-client';

async function main() {
  const provider = (process.argv[2] as ModelProvider) ?? 'kimi';
  const claims = generateClaims();
  const pair = claims.filter((c) => c.claim_id === 'FRD-MISMATCH-03A' || c.claim_id === 'FRD-MISMATCH-03B');
  if (pair.length !== 2) {
    throw new Error(`Expected to find both halves of the pair, found ${pair.length}`);
  }

  console.log(`Provider: ${provider}\n`);
  const registry = buildClaimNumberRegistry(pair.map((c) => c.claim_id));
  const results = await runAnalysis(pair, getProviderHistory(), registry, provider);

  for (const r of results) {
    console.log(`\n${registry.toDisplay(r.claim_id)} — category: ${r.proposed_category} (${r.category_detail})`);
    console.log(`Evidence (${r.evidence.length} entries):`);
    r.evidence.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  }
}

main().catch((err) => {
  console.error('Spot check failed:', err);
  process.exit(1);
});
