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

interface TestCase {
  label: string;
  /** Given a real internal claim_id, returns its display number — lets each
   *  case reference a specific seed claim without hardcoding a hash output. */
  question: (id: (claimId: string) => string) => string;
  /** A real internal claim_id, translated to its display number at call time. */
  claimInView?: string;
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
];

async function main() {
  console.log(`Anchor provider: ${ANCHOR_PROVIDER}\n`);
  console.log('Running the Pipeline once to build the claim index (standing in for the weekly cache)...\n');
  const claims = generateClaims();
  const providerHistory = getProviderHistory();
  const registry = buildClaimNumberRegistry(claims.map((c) => c.claim_id));
  const results = await runPipeline();
  const index = buildClaimIndex(claims, results, registry);
  console.log(`Index built: ${index.size} claims.\n`);
  console.log('='.repeat(70));

  for (const testCase of CASES) {
    const question = testCase.question((realId) => registry.toDisplay(realId));
    const claimInView = testCase.claimInView ? registry.toDisplay(testCase.claimInView) : undefined;

    console.log(`\n── ${testCase.label} ──`);
    console.log(`Q: "${question}"${claimInView ? ` (claim in view: ${claimInView})` : ''}`);

    const result = await askAnchor(
      question,
      { index, providerHistory, now: new Date(), claimInView },
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

  console.log(`\n${'='.repeat(70)}\n${CASES.length} questions run.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
