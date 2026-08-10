// One-off diagnostic (2026-08-09) — isolates whether full-context corpus
// stuffing meaningfully adds to Call 1's request latency, independent of
// everything else. Runs the same real chunk of claims twice: once normally,
// once with PIPELINE_STRIP_CORPUS_FOR_TEST=1 (see context.ts). Sequential,
// not parallel, so the two runs don't compete for the same rate limits.
// Run via: npx tsx --env-file=.env.local scripts/test-corpus-latency.ts

import { generateClaims, getProviderHistory } from '../src/lib/claims/generate-claims';
import { buildClaimNumberRegistry } from '../src/lib/claims/claim-number';
import { runAnalysis } from '../src/lib/pipeline/analysis';

async function main() {
  const claims = generateClaims(new Date()).slice(0, 14); // one chunk's worth, current production size
  const providerHistory = getProviderHistory();
  const registry = buildClaimNumberRegistry(claims.map((c) => c.claim_id));

  console.log(`Testing with ${claims.length} claims, real Kimi calls, sequential.\n`);

  console.log('Run 1: normal (full corpus stuffed into the prompt)...');
  let start = Date.now();
  await runAnalysis(claims, providerHistory, registry, 'kimi');
  const withCorpus = (Date.now() - start) / 1000;
  console.log(`  -> ${withCorpus.toFixed(1)}s\n`);

  console.log('Run 2: corpus stripped from the prompt entirely...');
  process.env.PIPELINE_STRIP_CORPUS_FOR_TEST = '1';
  start = Date.now();
  await runAnalysis(claims, providerHistory, registry, 'kimi');
  const withoutCorpus = (Date.now() - start) / 1000;
  console.log(`  -> ${withoutCorpus.toFixed(1)}s\n`);

  console.log(`Difference: ${(withCorpus - withoutCorpus).toFixed(1)}s`);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
