// One-off Pass G diagnostic (2026-08-06) — real Kimi token usage had never
// been measured before, only guessed at. Runs the real Pipeline (now
// chunked+parallel — see orchestrator.ts's PIPELINE_TARGET_CHUNK_SIZE) and
// reports actual completion_tokens/prompt_tokens/finish_reason per call,
// plus total wall-clock time. See model-client.ts's LOG_TOKEN_USAGE
// instrumentation (also temporary). CLAIM_LIMIT defaults to unbounded (the
// full authored claim set, same as the live app's own default now that
// Pass G's cap is gone) — override it for a smaller manual test run. Run via:
//   LOG_TOKEN_USAGE=1 npx tsx --env-file=.env.local scripts/diagnose-token-usage.ts
//   CLAIM_LIMIT=20 LOG_TOKEN_USAGE=1 npx tsx --env-file=.env.local scripts/diagnose-token-usage.ts

import { runPipeline } from '../src/lib/pipeline/orchestrator';

async function main() {
  const claimLimit = process.env.CLAIM_LIMIT ? Number(process.env.CLAIM_LIMIT) : Infinity;
  console.log(`Running real Pipeline (Kimi) against ${claimLimit === Infinity ? 'the full authored' : claimLimit}-claim set...\n`);
  const start = Date.now();
  const results = await runPipeline(new Date(), 'kimi', claimLimit);
  const elapsedSeconds = (Date.now() - start) / 1000;
  console.log(`\nDone: ${results.length} claims processed in ${elapsedSeconds.toFixed(1)}s`);
}

main().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
