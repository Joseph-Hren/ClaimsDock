// Phase 12 Pass C — multi-run Pipeline comparison. Runs the real Pipeline N
// times per provider against the same fixed 20-claim set (generateClaims()
// is seeded per ISO week, so every run this week sees identical claim data
// — any variance across runs is pure model variance, not different input)
// and reports per-run accuracy plus per-claim consistency, so a single
// lucky/unlucky run can't be mistaken for the real picture. Directly
// motivated by this project's own documented history of Claude's run-to-run
// category inconsistency — the same standard has to apply to Kimi before
// either one is trusted with a permanent routing decision.

import claimsData from '../src/lib/claims/claims-seed-data.json';
import type { Claim } from '../src/lib/claims/types';
import { runPipeline } from '../src/lib/pipeline/orchestrator';
import type { ModelProvider } from '../src/lib/pipeline/model-client';

const claimsById = new Map(
  (claimsData as { claims: Claim[] }).claims.map((c) => [c.claim_id, c]),
);
const allIds = [...claimsById.keys()];

// Claims specifically called out in prior batches as systematically wrong
// (not just unstable) — watched explicitly every run from here on so a
// prompt change's actual effect on these is visible even once they stop
// showing up in the generic "unstable" list.
const WATCH_LIST = ['MIS-CMB-01A', 'FRD-UNBUNDLE-01', 'FRD-SUBSTANDARD-01', 'CPX-CMS-01', 'AMB-CMB-01A', 'AMB-CMB-01B', 'FRD-MISMATCH-01A'];

// _testMeta.scenario labels which authored "combo" story a linked claim
// belongs to, not necessarily the correct Pipeline category for that
// specific claim — confirmed live (2026-08-02) for MIS-CMB-01A, whose own
// note reads "This professional claim is complete — the deliberate gap
// lives on the linked facility claim, MIS-CMB-01B," despite carrying
// scenario: "missing-data" (the combo group label). Checked every other
// combo pair (clean, ambiguous, complex-math) — none of them have this same
// mismatch, since a day-cap crossing or a responsible-party conflict really
// is a shared fact/question across both linked bills, unlike a blank NPI on
// one claim's own form, which has zero bearing on the other claim's own
// completeness. Grading against the raw scenario field for this one claim
// was marking a correct "clean" answer wrong for the entirety of this
// project's testing history until this override was added — this map, not
// claims-seed-data.json's own scenario field (still legitimately used for
// scenario-distribution counting elsewhere), is the fix.
// CPX-CMS-01 added 2026-08-03 after checking its authored note against the
// actual coverage-policy corpus: the note describes different post-
// deductible rates per line, but the corpus's rate table only has one entry
// ("Primary care / specialist office visits, 90%") any of this claim's
// three lines would fall under — no distinct rate exists for an in-office
// lab draw or ECG to actually split against. Both providers computing
// "clean" was the correct read given what the corpus supports; the label
// was a spec-authoring gap, not a model miss — accepted as-is (option b)
// rather than revising the corpus to manufacture the missing rate split.
const GROUND_TRUTH_OVERRIDE: Record<string, string> = {
  'MIS-CMB-01A': 'clean',
  'CPX-CMS-01': 'clean',
};

function groundTruthFor(id: string): string | undefined {
  return GROUND_TRUTH_OVERRIDE[id] ?? claimsById.get(id)?._testMeta.scenario;
}

interface ClaimOutcome {
  category: string;
  confidence: string | null;
  status: string;
}

interface RunRecord {
  runNumber: number;
  outcomeByClaimId: Map<string, ClaimOutcome>;
  matchCount: number;
  silentMisses: string[];
  failed: boolean;
  failureReason?: string;
}

// A run failing outright (withCompletenessRetry exhausting all attempts) is
// itself real reliability data, not just an obstacle to the comparison —
// the whole point of running multiple passes is to catch exactly this kind
// of instability, so a single run's failure must not abort the rest.
//
// Added 2026-08-02: raw category-match accuracy treats every miscategorized
// claim as equally bad, but the real system doesn't — per status.ts, a
// claim that's actually fraud/ambiguous/complex-math/material-missing-data
// NEVER auto-resolves regardless of what confidence it gets (it always
// stays flagged or hits Needs Approval), and a genuinely clean claim that
// gets over-flagged just costs a human a wasted review. The one and only
// dangerous outcome is category "clean" + a confident enough tier that the
// deterministic layer resolves it straight to "Resolved" with no human ever
// seeing it, on a claim that isn't actually clean. silentMisses tracks
// exactly that, using the real, authoritative status the deterministic
// layer computed — not a re-derived guess at what confidence implies.
async function runOnce(provider: ModelProvider, runNumber: number): Promise<RunRecord> {
  const start = Date.now();
  try {
    const results = await runPipeline(new Date(), provider);
    const outcomeByClaimId = new Map(
      results.map((r) => [r.claim_id, { category: r.category, confidence: r.confidence_tier, status: r.status }]),
    );
    let matchCount = 0;
    const silentMisses: string[] = [];
    for (const id of allIds) {
      const groundTruth = groundTruthFor(id);
      const outcome = outcomeByClaimId.get(id);
      if (outcome?.category === groundTruth) matchCount++;
      if (groundTruth !== 'clean' && outcome?.status === 'Resolved') silentMisses.push(id);
    }
    const silentNote = silentMisses.length > 0 ? `, ${silentMisses.length} SILENT MISS(ES): ${silentMisses.join(', ')}` : '';
    console.log(`  [${provider}] run ${runNumber}: ${matchCount}/${allIds.length} matched (${((Date.now() - start) / 1000).toFixed(0)}s)${silentNote}`);
    return { runNumber, outcomeByClaimId, matchCount, silentMisses, failed: false };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.log(`  [${provider}] run ${runNumber}: FAILED after ${((Date.now() - start) / 1000).toFixed(0)}s — ${reason}`);
    return { runNumber, outcomeByClaimId: new Map(), matchCount: 0, silentMisses: [], failed: true, failureReason: reason };
  }
}

function report(provider: ModelProvider, runs: RunRecord[]) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${provider.toUpperCase()} — ${runs.length} runs`);
  console.log('='.repeat(70));

  const failed = runs.filter((r) => r.failed);
  const succeeded = runs.filter((r) => !r.failed);
  console.log(`Outright failures (exhausted all retries): ${failed.length}/${runs.length}`);
  for (const f of failed) console.log(`  run ${f.runNumber}: ${f.failureReason}`);

  if (succeeded.length === 0) {
    console.log('No successful runs to report accuracy or consistency on.');
    return;
  }

  const accuracies = succeeded.map((r) => r.matchCount);
  console.log(`Accuracy per successful run: ${accuracies.join(', ')} (out of ${allIds.length})`);
  console.log(`Mean: ${(accuracies.reduce((a, b) => a + b, 0) / accuracies.length).toFixed(1)}, range: ${Math.min(...accuracies)}-${Math.max(...accuracies)}`);

  // The one outcome that actually matters most: a claim that isn't really
  // clean, resolved anyway with no human ever seeing it. Every other kind
  // of miscategorization still gets a human review somewhere downstream.
  const totalSilentMisses = succeeded.reduce((sum, r) => sum + r.silentMisses.length, 0);
  console.log(`\nSilent misses (not clean, but auto-resolved with no human review): ${totalSilentMisses} across ${succeeded.length} runs`);
  for (const r of succeeded) {
    if (r.silentMisses.length > 0) console.log(`  run ${r.runNumber}: ${r.silentMisses.join(', ')}`);
  }

  console.log(`\nWatch-list claims (previously flagged as systematically wrong, tracked explicitly regardless of stability):`);
  for (const id of WATCH_LIST) {
    const groundTruth = groundTruthFor(id);
    const outcomes = succeeded.map((r) => r.outcomeByClaimId.get(id));
    const categories = outcomes.map((o) => o?.category ?? '(missing)');
    const correctCount = categories.filter((c) => c === groundTruth).length;
    const detail = outcomes.map((o) => `${o?.category ?? '(missing)'}/${o?.confidence ?? 'N/A'}/${o?.status ?? '?'}`).join(', ');
    console.log(`  ${id} (ground truth: ${groundTruth}) — correct in ${correctCount}/${categories.length} runs: [${detail}]`);
  }

  console.log(`\nPer-claim consistency across successful runs (only claims that didn't get the same category every time):`);
  let anyUnstable = false;
  for (const id of allIds) {
    const groundTruth = groundTruthFor(id);
    const categories = succeeded.map((r) => r.outcomeByClaimId.get(id)?.category ?? '(missing)');
    const distinct = new Set(categories);
    if (distinct.size > 1) {
      anyUnstable = true;
      const counts = [...distinct].map((cat) => `${cat}: ${categories.filter((c) => c === cat).length}`).join(', ');
      console.log(`  ${id} (ground truth: ${groundTruth}) — ${counts}`);
    }
  }
  if (!anyUnstable) console.log('  (none — every claim got the same category in every successful run)');
}

async function main() {
  const providers: ModelProvider[] = [];
  const runsPerProvider = new Map<ModelProvider, number>();
  for (const arg of process.argv.slice(2)) {
    const [name, countStr] = arg.replace(/^--/, '').split('=');
    if (name === 'anthropic' || name === 'kimi') {
      providers.push(name);
      runsPerProvider.set(name, parseInt(countStr ?? '5', 10));
    }
  }
  if (providers.length === 0) {
    console.log('Usage: tsx scripts/compare-providers.ts --anthropic=5 --kimi=5');
    process.exit(1);
  }

  const allRuns = new Map<ModelProvider, RunRecord[]>();
  for (const provider of providers) {
    const n = runsPerProvider.get(provider)!;
    console.log(`\nRunning ${n} pass(es) against ${provider}...`);
    const runs: RunRecord[] = [];
    for (let i = 1; i <= n; i++) {
      runs.push(await runOnce(provider, i));
    }
    allRuns.set(provider, runs);
  }

  for (const provider of providers) {
    report(provider, allRuns.get(provider)!);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
