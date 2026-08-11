// Real end-to-end check of the Interactive Router + Anchor: builds the
// claim index from one live runPipeline() call (standing in for the
// per-ISO-week cache that app/api/ will eventually serve — see
// src/lib/router/types.ts), then fires a deliberately adversarial set of
// questions at askAnchor(), printing which tool(s) got called, with what
// parameters, and the final answer — for console review, same pattern as
// the Phase 4/5 smoke tests.
//
// The question set is designed around the three failure modes Section 1
// names explicitly (wrong tool, right tool/wrong params, Reference-Lookup
// misclassification), plus the ambiguous-query fallback and an out-of-scope
// request — not just happy path. Extended 2026-08-02 ("Anchor fixes 1") with
// cases for the new lookup_claim filter dimensions (patient/provider name,
// dollar amount, SLA%, recommended action), aggregate questions, bulk
// recommend_action drafting, cross-tool chaining, and the analyze_claim
// round-budget behavior.
//
// Questions reference claims by their opaque display number, not the real
// internal claim_id (Phase 11 Pass A0, project-spec.txt Section 7d) — an
// adjuster would only ever see the display number in the UI, so writing the
// test questions in terms of the real id (as this script did before Pass A0)
// would no longer accurately simulate real usage.

import { generateClaims, getProviderHistory } from '../src/lib/claims/generate-claims';
import { runPipeline } from '../src/lib/pipeline/orchestrator';
import { buildClaimIndex } from '../src/lib/router/types';
import { buildClaimNumberRegistry } from '../src/lib/claims/claim-number';
import { askAnchor } from '../src/lib/router/anchor';
import type { ModelProvider } from '../src/lib/pipeline/model-client';

// --provider=kimi to test Anchor's own Kimi tool-use path (Phase 13 Pass A);
// defaults to Anthropic, matching askAnchor's own default. Note this only
// selects Anchor's model — the claim index below is still built from a
// fresh runPipeline() call using the Pipeline's own default provider
// (Kimi as of Phase 12), same as before this flag existed.
const providerArg = process.argv.find((a) => a.startsWith('--provider='));
const ANCHOR_PROVIDER: ModelProvider = providerArg?.split('=')[1] === 'kimi' ? 'kimi' : 'anthropic';

// --only=<substring> runs just the cases whose label contains it (case-
// insensitive) — added 2026-08-11 so a targeted round of iteration on one
// feature doesn't have to re-run the whole adversarial set (and re-pay for
// it) every time. The one-time runPipeline() call to build the claim index
// below still happens regardless — no way around that cost, but it's a
// small fraction of what asking every case would cost.
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY_FILTER = onlyArg?.split('=')[1]?.toLowerCase();

interface TestCase {
  label: string;
  /** Given a real internal claim_id, returns its display number — lets each
   *  case reference a specific seed claim without hardcoding a hash output. */
  question: (id: (claimId: string) => string) => string;
  /** A real internal claim_id, translated to its display number at call time. */
  claimInView?: string;
  /** Real internal claim_ids, translated to display numbers at call time —
   *  simulates a real prior checkbox selection (2026-08-11), for cases about
   *  select_claims/deselect_claims referring to "these"/"them" rather than a
   *  filter. Every prior case left this empty (no real selection existed),
   *  which is exactly why the vague-reference failure mode this was added
   *  for was never actually exercised until it broke live. */
  selectedClaimIds?: string[];
  /** A hardcoded prior Q/A pair (2026-08-11) — CASES are otherwise
   *  independent, single-shot questions with no real conversation history,
   *  which is exactly why the "own recent answer treated as already having
   *  handled this new request" failure mode was never exercised until it
   *  broke live: a real deselect immediately following an answer that had
   *  itself just narrated a selection change. */
  priorTurn?: { question: string; answer: string };
}

const CASES: TestCase[] = [
  { label: 'Lookup — happy path', question: (id) => `What's the status of claim ${id('FRD-UPCODE-01')}?` },
  {
    label: 'Analysis — happy path / wrong-tool-risk pair with #1',
    question: (id) => `Does claim ${id('FRD-UPCODE-01')} look off? What evidence is there?`,
  },
  { label: 'Recommendation — happy path', question: (id) => `What should I do with claim ${id('CLN-CMS-01')}?` },
  { label: 'Reference Lookup — happy path', question: () => 'What does ERISA require for pre-service claims?' },
  {
    label: 'Wrong-claim-ID risk — question names a different claim than the one in view',
    question: (id) => `What's the status of claim ${id('FRD-UPCODE-01')}?`,
    claimInView: 'CLN-CMS-01',
  },
  {
    label: 'Reference-Lookup misclassification risk A — claim-specific, should NOT be reference_lookup',
    question: (id) => `Does claim ${id('MIS-CMS-01')}'s procedure need prior authorization?`,
  },
  {
    label: 'Reference-Lookup misclassification risk B — general, SHOULD be reference_lookup',
    question: () => 'Do physical therapy procedures generally need prior authorization?',
  },
  { label: 'Ambiguous query 1 — "problem claims"', question: () => 'Show me the problem claims.' },
  { label: 'Ambiguous query 2 — compound status filter', question: () => 'What claims do I need to work on today?' },
  {
    label: 'Out-of-scope — no tool should pretend to execute this',
    question: (id) => `Please deny claim ${id('FRD-UPCODE-01')} right now.`,
  },
  {
    label: 'New filter — patient-name substring (the real Nakamura/Ashcroft gap this fixes)',
    question: () => "Tell me about Nakamura's claim.",
  },
  {
    label: 'New filter — provider-name substring, multiple matches expected',
    question: () => 'Show me all claims from Meridian Pain & Wellness Center.',
  },
  {
    label: 'New filter — dollar-amount threshold',
    question: () => 'Show me claims over $10,000.',
  },
  {
    label: 'New filter — SLA percent remaining threshold',
    question: () => 'Show me claims with less than 10% of their SLA time remaining.',
  },
  {
    label: 'New filter — recommended_action',
    question: () => 'Show me all claims where the recommended action is Deny.',
  },
  {
    label: 'Aggregate question — must relay the tool\'s own count/total, not hand-sum',
    question: () => 'How many claims are currently flagged for fraud, and what\'s the total dollar amount across them?',
  },
  {
    label: 'Bulk recommend_action — drafting across a small group of claims',
    question: (id) =>
      `Draft a message for claims ${id('FRD-UPCODE-01')}, ${id('FRD-PHANTOM-01')}, and ${id('FRD-UNBUNDLE-01')}.`,
  },
  {
    label: 'Cross-tool chaining — fraud-denial drafting needs recommend_action + reference_lookup',
    question: (id) => `Draft the full four-part denial justification for claim ${id('FRD-UPCODE-01')}, citing the specific fraud pattern from the reference material.`,
  },
  {
    label: 'analyze_claim round-budget — more claims than comfortably fit in one exchange',
    question: (id) =>
      `Give me a deep analysis of claims ${id('FRD-PHANTOM-01')}, ${id('FRD-UNBUNDLE-01')}, ${id('FRD-SUBSTANDARD-01')}, ${id('FRD-DOUBLEBILL-01')}, and ${id('FRD-UPCODE-01')}.`,
  },
  {
    label: 'select_claims — happy path, explicit selection request',
    question: () => 'Select all claims suspected of fraud.',
  },
  {
    label: 'select_claims — must NOT fire for an ordinary lookup, only an explicit select request',
    question: () => 'Show me all claims suspected of fraud.',
  },
  {
    label: 'deselect_claims — clear the whole current selection, no filter',
    question: () => 'Deselect all claims in the Claims List.',
  },
  {
    label: 'deselect_claims — filtered, remove just a subset from the current selection',
    question: () => 'Deselect just the fraud ones, but leave everything else selected.',
  },
  {
    label: 'deselect_claims regression — vague reference to a real prior selection ("these") — must be a real tool call, not an echo of the context note',
    question: () => 'Deselect these claims.',
    selectedClaimIds: ['FRD-UPCODE-01', 'FRD-PHANTOM-01', 'FRD-UNBUNDLE-01', 'FRD-SUBSTANDARD-01', 'FRD-DOUBLEBILL-01'],
  },
  {
    label: 'deselect_claims regression — "all", with a real prior selection in context',
    question: () => 'Deselect all claims.',
    selectedClaimIds: ['FRD-UPCODE-01', 'FRD-PHANTOM-01', 'FRD-UNBUNDLE-01', 'FRD-SUBSTANDARD-01', 'FRD-DOUBLEBILL-01'],
  },
  {
    label: 'deselect_claims regression — positional slice the tool cannot express — must say so, never fabricate a result or claim IDs',
    question: () => 'Deselect the second half of them.',
    selectedClaimIds: ['FRD-UPCODE-01', 'FRD-PHANTOM-01', 'FRD-UNBUNDLE-01', 'FRD-SUBSTANDARD-01', 'FRD-DOUBLEBILL-01'],
  },
  {
    label: 'deselect_claims regression — standalone deselect right after an answer that itself just narrated a selection change (the real live failure)',
    question: () => 'Deselect all claims.',
    // The CURRENT real selection this new request must act on — deliberately
    // different from what the prior answer below describes, exactly like
    // the live case (the prior exchange's own claims were already replaced
    // by a new selection before this follow-up was asked).
    selectedClaimIds: ['CLN-CMS-01', 'MIS-CMS-01', 'FRD-SUBSTANDARD-01'],
    priorTurn: {
      question: 'Deselect all currently selected claims, and select claims that need approval.',
      answer:
        'Done — cleared your previous selection of 17 claims, then selected 3 claims that need approval in the Claims List.',
    },
  },
  {
    label: 'select_claims regression — "need to be escalated" must map to recommended_action: Escalate, not the broad "still active" status fallback',
    question: () => 'Select all claims that need to be escalated.',
  },
  {
    label: 'select_claims regression — "need additional info" must map to recommended_action: Request Additional Info, not status: Additional Info Requested',
    question: () => 'Select all claims that need additional info.',
  },
  {
    label: 'select_claims regression — "need approval" must map to status: Needs Approval alone, not the broad "still active" fallback',
    question: () => 'Select all claims that need approval.',
  },
];

async function main() {
  console.log(`Anchor provider: ${ANCHOR_PROVIDER}\n`);
  console.log('Running the Pipeline once to build the claim index (standing in for the weekly cache)...\n');
  const claims = generateClaims();
  const providerHistory = getProviderHistory();
  const registry = buildClaimNumberRegistry(claims.map((c) => c.claim_id));
  // Always Kimi here, independent of --provider/ANCHOR_PROVIDER above
  // (2026-08-11) — this call just builds throwaway claim data for the test
  // to run against; it has nothing to do with which model actually answers
  // Anchor's questions, and defaulting it to Anthropic (this function's own
  // default) meant every single smoke:router run — even --provider=kimi
  // ones — silently paid for a full, real, 18-call Claude Pipeline pass
  // first, regardless of what was actually being tested. Matches the real
  // app's own cost-driven default (cache.ts's PIPELINE_PROVIDER), which this
  // script should have matched from the start.
  const results = await runPipeline(new Date(), 'kimi');
  const index = buildClaimIndex(claims, results, registry);
  console.log(`Index built: ${index.size} claims.\n`);

  const cases = ONLY_FILTER ? CASES.filter((c) => c.label.toLowerCase().includes(ONLY_FILTER)) : CASES;
  if (ONLY_FILTER) console.log(`--only=${ONLY_FILTER}: running ${cases.length}/${CASES.length} cases.\n`);
  console.log('='.repeat(70));

  for (const testCase of cases) {
    const question = testCase.question((realId) => registry.toDisplay(realId));
    const claimInView = testCase.claimInView ? registry.toDisplay(testCase.claimInView) : undefined;
    const selectedClaimIds = testCase.selectedClaimIds?.map((id) => registry.toDisplay(id));

    console.log(`\n── ${testCase.label} ──`);
    console.log(`Q: "${question}"${claimInView ? ` (claim in view: ${claimInView})` : ''}${selectedClaimIds ? ` (selected: ${selectedClaimIds.join(', ')})` : ''}`);

    const result = await askAnchor(
      question,
      { index, providerHistory, now: new Date(), claimInView, selectedClaimIds, priorTurn: testCase.priorTurn },
      ANCHOR_PROVIDER,
    );

    if (result.toolCalls.length === 0) {
      console.log('  (no tool called)');
    } else {
      for (const call of result.toolCalls) {
        console.log(`  tool: ${call.name}`);
        console.log(`  input: ${JSON.stringify(call.input)}`);
      }
    }
    console.log(`  answer: ${result.answer}`);
  }

  console.log(`\n${'='.repeat(70)}\n${cases.length} questions run.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
