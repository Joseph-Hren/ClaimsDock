// Real end-to-end check of the Evaluation Pipeline: two live API calls
// (Sonnet, low effort) against all 20 seed claims. No UI exists yet
// (Phase 8), so this prints a readable per-claim summary to the console —
// matching the smoke-test-rag.ts pattern from Phase 4. Also compares Call
// 1's category against each claim's _testMeta.scenario ground truth, since
// that metadata exists specifically so a check like this can use it.

import claimsData from '../src/lib/claims/claims-seed-data.json';
import type { Claim } from '../src/lib/claims/types';
import { runPipeline } from '../src/lib/pipeline/orchestrator';
import type { ModelProvider } from '../src/lib/pipeline/model-client';

const provider: ModelProvider = process.argv.includes('--kimi') ? 'kimi' : 'anthropic';

const claimsById = new Map(
  (claimsData as { claims: Claim[] }).claims.map((c) => [c.claim_id, c]),
);

function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function main() {
  console.log(`Running the Evaluation Pipeline against all 20 seed claims (provider: ${provider})...\n`);
  const results = await runPipeline(new Date(), provider);

  let categoryMatches = 0;
  let overrideCount = 0;

  for (const r of results) {
    const claim = claimsById.get(r.claim_id);
    const groundTruth = claim?._testMeta.scenario;
    const groundTruthMatch = groundTruth === r.category ? 'match' : `MISMATCH (authored as ${groundTruth})`;
    if (groundTruth === r.category) categoryMatches++;
    if (r.safety_net_override) overrideCount++;

    console.log(`── ${r.claim_id} — ${claim?.patient.name ?? '?'} — ${money(claim?.total_charge ?? 0)} ──`);
    console.log(`  category:        ${r.category} (${groundTruthMatch}) — ${r.category_detail}`);
    console.log(`  evidence:`);
    r.evidence.forEach((e) => console.log(`    - ${e}`));
    if (r.safety_net_override) console.log(`  safety net:      ${r.safety_net_override}`);
    console.log(`  confidence:      ${r.confidence_tier ?? 'N/A (complex-math)'}`);
    console.log(`  disputed necess: ${r.disputed_medical_necessity}`);
    console.log(`  severity:        ${r.severity}`);
    console.log(`  status:          ${r.status}`);
    console.log(`  recommended:     ${r.recommended_action}`);
    console.log(`  narrative:       ${r.recommendation_narrative}`);
    console.log(`  SLA:             ${(r.sla.percentRemaining * 100).toFixed(0)}% window remaining${r.sla.isBreached ? ' — BREACHED' : ''}`);
    console.log('');
  }

  console.log('─'.repeat(60));
  console.log(`${results.length} claims evaluated.`);
  console.log(`Category vs. authored scenario: ${categoryMatches}/${results.length} matched.`);
  console.log(`Safety-net overrides triggered: ${overrideCount}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
