// Real end-to-end check of the Human Gate: builds the claim index from a
// direct runPipeline() call (same pattern as smoke-test-router.ts/
// smoke-test-pipeline.ts), then runs checkGuardrails() + submitHumanAction()
// against a handful of deliberately chosen cases — a mismatch with a good
// reason, a mismatch with a bad one, an action that matches the
// recommendation, and the "Eat my shorts" case Section 4a was designed
// around. Persistence (localStorage) already has real jsdom unit tests
// (src/lib/persistence/) — this script's job is the two pieces that
// genuinely need a live model call: the mismatch check's evidence citation
// and the four-field justification-quality check.
//
// Deliberately NOT getCachedPipelineResults() (pipeline/cache.ts) — its
// unstable_cache wrapper (Phase 13 Pass A) requires a real Next.js request
// context (`incrementalCache`) that doesn't exist under bare tsx, confirmed
// live via the exact "Invariant: incrementalCache missing" throw cache.ts's
// own comments already document for bare Vitest. That path is exercised for
// real only by an actual running server (app/api/anchor/route.ts) and, in
// isolation, by cache.test.ts's own mocked unit test — not by this script.

import { generateClaims } from '../src/lib/claims/generate-claims';
import { runPipeline } from '../src/lib/pipeline/orchestrator';
import { checkGuardrails } from '../src/lib/humangate/guardrails';
import { submitHumanAction } from '../src/lib/humangate/actions';
import type { HumanActionInput } from '../src/lib/humangate/types';

interface TestCase {
  label: string;
  claimId: string;
  input: HumanActionInput;
}

async function main() {
  const claims = generateClaims();
  console.log('Running a live Pipeline pass to build the claim index...\n');
  const results = await runPipeline();
  const byId = new Map(claims.map((c) => [c.claim_id, c]));
  const resultById = new Map(results.map((r) => [r.claim_id, r]));

  // Pick real recommended actions off this run so the cases below make sense
  // regardless of the Pipeline's (known-nondeterministic) exact output.
  const cleanClaim = results.find((r) => r.category === 'clean' && r.recommended_action === 'Approve');
  const fraudDenyClaim = results.find((r) => r.category === 'fraud' && r.recommended_action === 'Deny');

  const cases: TestCase[] = [];
  if (cleanClaim) {
    cases.push({
      label: 'Mismatch + flippant denial justification ("Eat my shorts") — Section 4a\'s own example',
      claimId: cleanClaim.claim_id,
      input: {
        claimId: cleanClaim.claim_id,
        action: 'deny',
        denialJustification: {
          specificReason: 'Eat my shorts!',
          planPolicyProvision: 'lol none',
          internalRuleOrStandard: 'idk',
          reversalCriteria: 'idk',
        },
      },
    });
    cases.push({
      label: 'Mismatch + a genuine, specific denial justification, all four fields real',
      claimId: cleanClaim.claim_id,
      input: {
        claimId: cleanClaim.claim_id,
        action: 'deny',
        denialJustification: {
          specificReason: 'Reviewed the underlying documentation directly and found a discrepancy the automated evidence missed; denying pending provider clarification.',
          planPolicyProvision: 'Coverage Policy §3.2 — documentation-consistency requirement.',
          internalRuleOrStandard: 'None.',
          reversalCriteria: 'Provider furnishes documentation reconciling the discrepancy.',
        },
      },
    });
    cases.push({
      label: 'Fields 1/2 are real facts about the claim, but irrelevant to the denial — should now be REJECTED',
      claimId: cleanClaim.claim_id,
      input: {
        claimId: cleanClaim.claim_id,
        action: 'deny',
        denialJustification: {
          specificReason: 'Claim was submitted three weeks ago.',
          planPolicyProvision: 'Coverage Policy §1.1 — general plan eligibility.',
          internalRuleOrStandard: 'None.',
          reversalCriteria: 'None.',
        },
      },
    });
    cases.push({
      label: 'Fields 3/4 explicitly state "none applies" — should be ACCEPTED, no suggested replacement',
      claimId: cleanClaim.claim_id,
      input: {
        claimId: cleanClaim.claim_id,
        action: 'deny',
        denialJustification: {
          specificReason: 'Reviewed documentation directly and found a discrepancy the automated evidence missed; denying pending provider clarification.',
          planPolicyProvision: 'Coverage Policy §3.2 — documentation-consistency requirement.',
          internalRuleOrStandard: 'None — no internal rule or clinical protocol applies beyond the cited policy provision.',
          reversalCriteria: 'None — no information currently on file would change this determination.',
        },
      },
    });
    cases.push({
      label: 'All four fields left blank — should short-circuit, no API call',
      claimId: cleanClaim.claim_id,
      input: {
        claimId: cleanClaim.claim_id,
        action: 'deny',
        denialJustification: { specificReason: '', planPolicyProvision: '', internalRuleOrStandard: '', reversalCriteria: '' },
      },
    });
  }
  if (fraudDenyClaim) {
    cases.push({
      label: 'Action matches the recommendation — mismatch should NOT fire',
      claimId: fraudDenyClaim.claim_id,
      input: {
        claimId: fraudDenyClaim.claim_id,
        action: 'deny',
        denialJustification: {
          specificReason: 'Denying per the confirmed upcoding finding — billed acuity is inconsistent with documented patient status.',
          planPolicyProvision: 'Fraud-Indicator Reference §2 — upcoding.',
          internalRuleOrStandard: 'None.',
          reversalCriteria: 'Provider documentation supporting the billed acuity level is furnished.',
        },
      },
    });
    cases.push({
      label: 'Mismatch — approving a claim recommended for denial',
      claimId: fraudDenyClaim.claim_id,
      input: { claimId: fraudDenyClaim.claim_id, action: 'approve' },
    });
  }

  for (const testCase of cases) {
    const claim = byId.get(testCase.claimId)!;
    const result = resultById.get(testCase.claimId)!;

    console.log(`── ${testCase.label} ──`);
    console.log(`Claim: ${testCase.claimId} (recommended: ${result.recommended_action}) | Human action: ${testCase.input.action}`);
    if (testCase.input.denialJustification) {
      console.log(`Denial justification given: ${JSON.stringify(testCase.input.denialJustification)}`);
    }
    if (testCase.input.note) console.log(`Note given: "${testCase.input.note}"`);

    const findings = await checkGuardrails(result, testCase.input);
    console.log(`  Mismatch check: ${findings.mismatch.mismatched ? 'FIRED' : 'clear'}`);
    if (findings.mismatch.message) console.log(`    ${findings.mismatch.message}`);
    if (findings.denialJustification) {
      for (const [field, checkResult] of Object.entries(findings.denialJustification)) {
        console.log(`  Denial field "${field}": ${checkResult.acceptable ? 'acceptable' : 'INADEQUATE'}`);
        console.log(`    feedback: ${checkResult.feedback}`);
        if (checkResult.suggestedReplacement) console.log(`    suggested replacement: ${checkResult.suggestedReplacement}`);
      }
    }

    const submission = submitHumanAction(claim, result, testCase.input);
    console.log(`  Submitted -> status: ${submission.status}, severity: ${submission.severity}`);
    console.log('');
  }

  console.log(`${cases.length} cases run.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
